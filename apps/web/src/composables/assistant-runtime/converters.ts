import type {
  Message as ApiMessage,
  Conversation,
  CoreMessage,
  ToolCall,
} from '@univedge/locus-agent-sdk'
import type {
  ConversationRuntimeState,
  Message,
  MessagePart,
  ToolCallState,
} from './types'
import type { TodoTask } from '@/utils/parsers'
import { parseManageTodosResult } from '@/utils/parsers'

export function reconstructToolCallStates(
  toolCalls: ToolCall[],
  /**
   * All consecutive tool messages that follow the assistant message.
   * Parallel tool calls produce one tool message each, so we must
   * scan all of them to pair every tool-call with its result.
   */
  toolMessages: ApiMessage[],
): { toolCallStates: ToolCallState[], parts: MessagePart[], todos: TodoTask[] } {
  const parts: MessagePart[] = []
  let todos: TodoTask[] = []

  const toolCallStates: ToolCallState[] = toolCalls.map((tc, idx) => {
    parts.push({ type: 'tool-call', toolCallIndex: idx })
    return { toolCall: tc, status: 'completed' as const }
  })

  for (const toolMsg of toolMessages) {
    if (toolMsg.role !== 'tool' || !toolMsg.toolResults)
      continue
    for (const toolResult of toolMsg.toolResults) {
      const toolCallIndex = toolCallStates.findIndex(
        tc => tc.toolCall.toolCallId === toolResult.toolCallId,
      )
      const existingTc = toolCallIndex !== -1 ? toolCallStates[toolCallIndex] : undefined
      if (existingTc) {
        const output = existingTc.toolCall.toolName === 'bash' && toolResult.result
          ? (typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result))
          : undefined
        toolCallStates[toolCallIndex] = {
          ...existingTc,
          result: toolResult,
          status: toolResult.isError ? 'error' : 'completed',
          output,
        }

        if (!toolResult.isError && existingTc.toolCall.toolName === 'manage_todos') {
          const parsed = parseManageTodosResult(toolResult.result)
          if (parsed)
            todos = parsed
        }
      }
    }
  }

  return { toolCallStates, parts, todos }
}

export function convertApiMessageToUIMessage(
  m: ApiMessage,
  toolMessages: ApiMessage[],
): { message: Message, todos: TodoTask[] } {
  const parts: MessagePart[] = []
  let toolCallStates: ToolCallState[] | undefined
  let todos: TodoTask[] = []

  if (m.role === 'assistant' && m.reasoning) {
    parts.push({ type: 'reasoning', content: m.reasoning })
  }

  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    const result = reconstructToolCallStates(m.toolCalls, toolMessages)
    toolCallStates = result.toolCallStates
    parts.push(...result.parts)
    todos = result.todos
  }

  if (m.content) {
    parts.push({ type: 'text', content: m.content })
  }

  return {
    message: {
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      attachments: m.attachments ?? undefined,
      model: m.role === 'assistant' ? (m.model ?? undefined) : undefined,
      reasoning: m.reasoning || undefined,
      metadata: m.metadata ?? undefined,
      usage: m.role === 'assistant' && m.usage
        ? {
            promptTokens: m.usage.promptTokens,
            completionTokens: m.usage.completionTokens,
            totalTokens: m.usage.totalTokens,
          }
        : undefined,
      timestamp: new Date(m.createdAt).getTime(),
      toolCalls: toolCallStates,
      parts: parts.length > 0 ? parts : undefined,
    },
    todos,
  }
}

export function messagesToCoreMessages(msgs: Message[]): CoreMessage[] {
  const out: CoreMessage[] = []
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content, attachments: m.attachments })
    }
    else {
      const assistantMsg: CoreMessage = { role: 'assistant', content: m.content }
      if (m.toolCalls && m.toolCalls.length > 0) {
        ;(assistantMsg as { toolCalls: ToolCall[] }).toolCalls = m.toolCalls.map(tc => tc.toolCall)
        out.push(assistantMsg)
        const toolResults = m.toolCalls
          .filter(tc => tc.result)
          .map(tc => tc.result!)
        if (toolResults.length > 0) {
          out.push({ role: 'tool', content: '', toolResults })
        }
      }
      else {
        out.push(assistantMsg)
      }
    }
  }
  return out
}

export function applyConversationData(
  data: { conversation: Conversation, messages: ApiMessage[] },
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState,
  currentConversationId: string | null,
  onConversationDataApplied?: (args: { conversationId: string, conversation: Conversation }) => void,
) {
  if (!currentConversationId)
    return

  const convertedMessages: Message[] = []
  let latestTodos: TodoTask[] = []

  for (let i = 0; i < data.messages.length; i++) {
    const m = data.messages[i]!
    if (m.role === 'tool')
      continue

    // Collect ALL consecutive tool messages that follow this message.
    // Parallel tool calls each produce a separate tool message, so a single
    // assistant turn can be followed by N tool messages (one per parallel call).
    const followingToolMessages: ApiMessage[] = []
    let j = i + 1
    while (j < data.messages.length && data.messages[j]!.role === 'tool') {
      followingToolMessages.push(data.messages[j]!)
      j++
    }

    const { message, todos } = convertApiMessageToUIMessage(m, followingToolMessages)
    convertedMessages.push(message)
    if (todos.length > 0)
      latestTodos = todos
  }

  const runtimeState = getConversationRuntimeState(currentConversationId)
  runtimeState.messages = convertedMessages
  runtimeState.todoTasks = latestTodos
  onConversationDataApplied?.({ conversationId: currentConversationId, conversation: data.conversation })
}
