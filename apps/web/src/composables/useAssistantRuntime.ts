import type {
  Message as ApiMessage,
  Conversation,
  CoreMessage,
  DelegateDelta,
  MessageImageAttachment,
  ToolCall,
  ToolResult,
} from '@univedge/locus-agent-sdk'
import type { ComputedRef, Ref } from 'vue'
import type { PendingApproval, PendingQuestion } from '@/api/chat'
import { computed, ref } from 'vue'

const RE_TODO_LINE = /^\d+\.\s+\[(?:completed|in_progress)\]/

export interface ToolCallState {
  toolCall: ToolCall
  result?: ToolResult
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval' | 'awaiting-question' | 'interrupted'
  output?: string
  delegateDeltas?: DelegateDelta[]
}

export type MessagePart
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }
    | { type: 'tool-call', toolCallIndex: number }

export interface QueuedMessage {
  id: string
  content: string
  attachments?: MessageImageAttachment[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageImageAttachment[]
  model?: string
  timestamp: number
  toolCalls?: ToolCallState[]
  isStreaming?: boolean
  reasoning?: string
  parts?: MessagePart[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** 消息元数据 — 携带 trigger 的消息不在 UI 渲染 */
  metadata?: { trigger?: string }
}

export interface TodoTask {
  id: string
  content: string
  status: 'in_progress' | 'completed'
}

export type AssistantError = { code: string, message: string } | null

export interface ConversationRuntimeState {
  messages: Message[]
  todoTasks: TodoTask[]
  isLoading: boolean
  error: AssistantError
  currentStreamingMessageId: string | null
  pendingApprovals: Map<string, PendingApproval>
  pendingQuestions: Map<string, PendingQuestion>
  messageQueue: QueuedMessage[]
  isProcessingQueue: boolean
}

export function createConversationRuntimeState(): ConversationRuntimeState {
  return {
    messages: [],
    todoTasks: [],
    isLoading: false,
    error: null,
    currentStreamingMessageId: null,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    messageQueue: [],
    isProcessingQueue: false,
  }
}

export function parseManageTodosResult(result: unknown): TodoTask[] | null {
  if (typeof result === 'object' && result !== null) {
    const todos = (result as { todos?: unknown }).todos
    if (!Array.isArray(todos))
      return null

    const parsed = todos
      .map((item) => {
        if (typeof item !== 'object' || item === null)
          return null
        const maybe = item as { id?: unknown, content?: unknown, status?: unknown }
        if (typeof maybe.id !== 'string' || typeof maybe.content !== 'string')
          return null
        if (maybe.status !== 'in_progress' && maybe.status !== 'completed')
          return null
        return {
          id: maybe.id,
          content: maybe.content,
          status: maybe.status,
        } as TodoTask
      })
      .filter((item): item is TodoTask => !!item)

    return parsed
  }

  if (typeof result !== 'string')
    return null

  const lines = result.split('\n')
  const todoLines = lines.filter((line) => {
    const normalized = line.trim()
    return RE_TODO_LINE.test(normalized) && normalized.includes(') ')
  })
  if (todoLines.length === 0) {
    if (result.includes('Current todos: (empty)'))
      return []
    return null
  }

  const parsed: TodoTask[] = []
  for (const line of todoLines) {
    const normalized = line.trim()
    const status = normalized.includes('[completed]')
      ? 'completed'
      : normalized.includes('[in_progress]')
        ? 'in_progress'
        : null
    if (!status)
      continue

    const idStart = normalized.indexOf('(')
    const idEnd = normalized.indexOf(')', idStart + 1)
    if (idStart === -1 || idEnd === -1 || idEnd <= idStart + 1)
      continue

    const id = normalized.slice(idStart + 1, idEnd).trim()
    const content = normalized.slice(idEnd + 1).trim()
    if (!id || !content)
      continue

    parsed.push({
      id,
      status,
      content,
    })
  }

  return parsed
}

export interface AssistantRuntimeManager {
  messages: ComputedRef<Message[]>
  todoTasks: ComputedRef<TodoTask[]>
  isLoading: ComputedRef<boolean>
  error: ComputedRef<AssistantError>
  currentStreamingMessageId: ComputedRef<string | null>
  pendingApprovals: ComputedRef<Map<string, PendingApproval>>
  pendingQuestions: ComputedRef<Map<string, PendingQuestion>>
  messageQueue: ComputedRef<QueuedMessage[]>
  isProcessingQueue: ComputedRef<boolean>
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState
  clearConversationRuntimeState: (conversationId?: string | null) => void
  removeConversationRuntimeState: (conversationId: string) => void
  applyConversationData: (data: { conversation: Conversation, messages: ApiMessage[] }, conversationId?: string | null) => void
  messagesToCoreMessages: (msgs: Message[]) => CoreMessage[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>, conversationId?: string | null) => string
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string | null) => void
  appendToMessage: (id: string, content: string, conversationId?: string | null) => void
  appendReasoningToMessage: (id: string, content: string, conversationId?: string | null) => void
  addToolCallToMessage: (id: string, toolCall: ToolCall, conversationId?: string | null) => void
  updateToolCallResult: (messageId: string, toolResult: ToolResult, conversationId?: string | null) => void
  appendToolCallOutput: (toolCallId: string, delta: string, conversationId?: string | null) => void
  appendDelegateDelta: (toolCallId: string, delta: DelegateDelta, conversationId?: string | null) => void
  setToolCallAwaitingApproval: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  setToolCallAwaitingQuestion: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  setToolCallExecuting: (toolCallId: string, conversationId?: string | null) => void
  addPendingApproval: (approval: PendingApproval, conversationId?: string | null) => void
  removePendingApproval: (toolCallId: string, conversationId?: string | null) => void
  clearPendingApprovals: (conversationId?: string | null) => void
  addPendingQuestion: (question: PendingQuestion, conversationId?: string | null) => void
  removePendingQuestion: (toolCallId: string, conversationId?: string | null) => void
  clearMessages: (conversationId?: string | null) => void
  deleteMessagesFrom: (messageId: string, conversationId?: string | null) => boolean
  setLoading: (loading: boolean, conversationId?: string | null) => void
  setError: (err: AssistantError, conversationId?: string | null) => void
  clearError: (conversationId?: string | null) => void
}

interface CreateAssistantRuntimeManagerOptions {
  currentConversationId: Ref<string | null>
  onConversationDataApplied?: (args: {
    conversationId: string
    conversation: Conversation
  }) => void
}

export function createAssistantRuntimeManager(options: CreateAssistantRuntimeManagerOptions): AssistantRuntimeManager {
  const conversationRuntimeStates = ref<Record<string, ConversationRuntimeState>>({})
  const draftRuntimeState = ref<ConversationRuntimeState>(createConversationRuntimeState())

  function ensureConversationRuntimeState(conversationId: string): ConversationRuntimeState {
    const existing = conversationRuntimeStates.value[conversationId]
    if (existing)
      return existing

    const created = createConversationRuntimeState()
    conversationRuntimeStates.value[conversationId] = created
    return created
  }

  function getConversationRuntimeState(conversationId: string | null | undefined = options.currentConversationId.value): ConversationRuntimeState {
    if (!conversationId)
      return draftRuntimeState.value
    return ensureConversationRuntimeState(conversationId)
  }

  function clearConversationRuntimeState(conversationId: string | null | undefined = options.currentConversationId.value) {
    if (!conversationId) {
      draftRuntimeState.value = createConversationRuntimeState()
      return
    }
    conversationRuntimeStates.value[conversationId] = createConversationRuntimeState()
  }

  function removeConversationRuntimeState(conversationId: string) {
    if (conversationRuntimeStates.value[conversationId]) {
      delete conversationRuntimeStates.value[conversationId]
    }
  }

  const messages = computed<Message[]>({
    get: () => getConversationRuntimeState().messages,
    set: value => (getConversationRuntimeState().messages = value),
  })
  const todoTasks = computed<TodoTask[]>({
    get: () => getConversationRuntimeState().todoTasks,
    set: value => (getConversationRuntimeState().todoTasks = value),
  })
  const isLoading = computed<boolean>({
    get: () => getConversationRuntimeState().isLoading,
    set: value => (getConversationRuntimeState().isLoading = value),
  })
  const error = computed<AssistantError>({
    get: () => getConversationRuntimeState().error,
    set: value => (getConversationRuntimeState().error = value),
  })
  const currentStreamingMessageId = computed<string | null>({
    get: () => getConversationRuntimeState().currentStreamingMessageId,
    set: value => (getConversationRuntimeState().currentStreamingMessageId = value),
  })
  const pendingApprovals = computed<Map<string, PendingApproval>>({
    get: () => getConversationRuntimeState().pendingApprovals,
    set: value => (getConversationRuntimeState().pendingApprovals = value),
  })
  const pendingQuestions = computed<Map<string, PendingQuestion>>({
    get: () => getConversationRuntimeState().pendingQuestions,
    set: value => (getConversationRuntimeState().pendingQuestions = value),
  })
  const messageQueue = computed<QueuedMessage[]>({
    get: () => getConversationRuntimeState().messageQueue,
    set: value => (getConversationRuntimeState().messageQueue = value),
  })
  const isProcessingQueue = computed<boolean>({
    get: () => getConversationRuntimeState().isProcessingQueue,
    set: value => (getConversationRuntimeState().isProcessingQueue = value),
  })

  function applyConversationData(
    data: { conversation: Conversation, messages: ApiMessage[] },
    conversationId: string | null = options.currentConversationId.value,
  ) {
    if (!conversationId)
      return

    const convertedMessages: Message[] = []
    let reconstructedTodos: TodoTask[] = []

    for (let i = 0; i < data.messages.length; i++) {
      const m = data.messages[i]!
      if (m.role === 'tool')
        continue

      const parts: MessagePart[] = []
      let toolCallStates: ToolCallState[] | undefined

      if (m.role === 'assistant' && m.reasoning) {
        parts.push({ type: 'reasoning', content: m.reasoning })
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        toolCallStates = m.toolCalls.map((tc, idx) => {
          parts.push({ type: 'tool-call', toolCallIndex: idx })
          return { toolCall: tc, status: 'completed' as const }
        })

        const nextMessage = data.messages[i + 1]
        if (nextMessage && nextMessage.role === 'tool' && nextMessage.toolResults) {
          for (const toolResult of nextMessage.toolResults) {
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
                  reconstructedTodos = parsed
              }
            }
          }
        }
      }

      if (m.content) {
        parts.push({ type: 'text', content: m.content })
      }

      convertedMessages.push({
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
      })
    }

    const runtimeState = getConversationRuntimeState(conversationId)
    runtimeState.messages = convertedMessages
    runtimeState.todoTasks = reconstructedTodos
    options.onConversationDataApplied?.({ conversationId, conversation: data.conversation })
  }

  function messagesToCoreMessages(msgs: Message[]): CoreMessage[] {
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

  function addMessage(
    message: Omit<Message, 'id' | 'timestamp'>,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    runtimeState.messages.push(newMessage)
    return newMessage.id
  }

  function updateMessage(
    id: string,
    updates: Partial<Message>,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const existing = index !== -1 ? runtimeState.messages[index] : undefined
    if (existing) {
      runtimeState.messages[index] = { ...existing, ...updates } as Message
    }
  }

  function appendToMessage(
    id: string,
    content: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
    if (!message)
      return

    const parts = [...(message.parts || [])]
    const lastPart = parts.at(-1)

    if (lastPart && lastPart.type === 'text') {
      parts[parts.length - 1] = { type: 'text', content: lastPart.content + content }
    }
    else {
      parts.push({ type: 'text', content })
    }

    runtimeState.messages[index] = {
      ...message,
      content: message.content + content,
      parts,
    }
  }

  function appendReasoningToMessage(
    id: string,
    content: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
    if (!message)
      return

    const parts = [...(message.parts || [])]
    const lastPart = parts.at(-1)

    if (lastPart && lastPart.type === 'reasoning') {
      parts[parts.length - 1] = { type: 'reasoning', content: lastPart.content + content }
    }
    else {
      parts.push({ type: 'reasoning', content })
    }

    runtimeState.messages[index] = {
      ...message,
      reasoning: (message.reasoning || '') + content,
      parts,
    }
  }

  function addToolCallToMessage(
    id: string,
    toolCall: ToolCall,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
    if (!message)
      return

    const toolCalls = [...(message.toolCalls || [])]
    const existingIndex = toolCalls.findIndex(
      tc => tc.toolCall.toolCallId === toolCall.toolCallId,
    )
    if (existingIndex >= 0) {
      const existing = toolCalls[existingIndex]
      if (!existing)
        return
      toolCalls[existingIndex] = { ...existing, toolCall }
      runtimeState.messages[index] = {
        ...message,
        toolCalls,
      }
      return
    }

    const toolCallIndex = toolCalls.length
    toolCalls.push({ toolCall, status: 'pending' })

    const parts = [...(message.parts || [])]
    parts.push({ type: 'tool-call', toolCallIndex })

    runtimeState.messages[index] = {
      ...message,
      toolCalls,
      parts,
    }
  }

  function updateToolCallResult(
    messageId: string,
    toolResult: ToolResult,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolResult.toolCallId) {
          return toolCallState
        }
        hasMatch = true
        let status: ToolCallState['status'] = 'completed'
        if (toolResult.isInterrupted) {
          status = 'interrupted'
        }
        else if (toolResult.isError) {
          status = 'error'
        }
        return {
          ...toolCallState,
          result: toolResult,
          status,
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }

      const matchedToolCall = message.toolCalls.find(tc => tc.toolCall.toolCallId === toolResult.toolCallId)?.toolCall
      if (matchedToolCall && matchedToolCall.toolName === 'manage_todos' && !toolResult.isError) {
        const parsed = parseManageTodosResult(toolResult.result)
        if (parsed)
          runtimeState.todoTasks = parsed
      }
    }
    runtimeState.pendingApprovals.delete(toolResult.toolCallId)
  }

  function appendToolCallOutput(
    toolCallId: string,
    delta: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      const tcIndex = message.toolCalls.findIndex(
        tc => tc.toolCall.toolCallId === toolCallId,
      )
      if (tcIndex === -1)
        continue

      const tc = message.toolCalls[tcIndex]!
      const newToolCalls = [...message.toolCalls]
      newToolCalls[tcIndex] = {
        ...tc,
        output: (tc.output || '') + delta,
      }
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function appendDelegateDelta(
    toolCallId: string,
    delta: DelegateDelta,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      const tcIndex = message.toolCalls.findIndex(
        tc => tc.toolCall.toolCallId === toolCallId,
      )
      if (tcIndex === -1)
        continue

      const tc = message.toolCalls[tcIndex]!
      const newToolCalls = [...message.toolCalls]
      newToolCalls[tcIndex] = {
        ...tc,
        delegateDeltas: [...(tc.delegateDeltas || []), delta],
      }
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function setToolCallAwaitingApproval(
    messageId: string,
    toolCallId: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-approval',
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallAwaitingQuestion(
    messageId: string,
    toolCallId: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-question',
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallExecuting(
    toolCallId: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = 0; i < runtimeState.messages.length; i++) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        if (toolCallState.status !== 'awaiting-approval' && toolCallState.status !== 'awaiting-question') {
          return toolCallState
        }
        return { ...toolCallState, status: 'pending' }
      })

      if (hasMatch) {
        runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
        return
      }
    }
  }

  function addPendingApproval(
    approval: PendingApproval,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.set(approval.toolCallId, approval)
  }

  function removePendingApproval(
    toolCallId: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.delete(toolCallId)
  }

  function clearPendingApprovals(conversationId: string | null = options.currentConversationId.value) {
    getConversationRuntimeState(conversationId).pendingApprovals.clear()
  }

  function addPendingQuestion(
    question: PendingQuestion,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.set(question.toolCallId, question)
  }

  function removePendingQuestion(
    toolCallId: string,
    conversationId: string | null = options.currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.delete(toolCallId)
  }

  function clearMessages(conversationId: string | null = options.currentConversationId.value) {
    const runtimeState = getConversationRuntimeState(conversationId)
    runtimeState.messages = []
    runtimeState.todoTasks = []
    runtimeState.messageQueue = []
    runtimeState.error = null
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false
    runtimeState.pendingApprovals.clear()
    runtimeState.pendingQuestions.clear()
    runtimeState.isProcessingQueue = false
  }

  function deleteMessagesFrom(messageId: string, conversationId: string | null = options.currentConversationId.value): boolean {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)

    if (messageIndex === -1) {
      console.warn('[deleteMessagesFrom] 未找到消息:', messageId)
      return false
    }

    // 删除该位置及之后的所有消息
    runtimeState.messages = runtimeState.messages.slice(0, messageIndex)

    // 清理相关的待办任务（因为它们可能依赖于被删除的消息）
    runtimeState.todoTasks = []

    // 清空相关状态
    runtimeState.error = null
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false
    runtimeState.pendingApprovals.clear()
    runtimeState.pendingQuestions.clear()
    runtimeState.isProcessingQueue = false

    return true
  }

  function setLoading(loading: boolean, conversationId: string | null = options.currentConversationId.value) {
    getConversationRuntimeState(conversationId).isLoading = loading
  }

  function setError(err: AssistantError, conversationId: string | null = options.currentConversationId.value) {
    getConversationRuntimeState(conversationId).error = err
  }

  function clearError(conversationId: string | null = options.currentConversationId.value) {
    getConversationRuntimeState(conversationId).error = null
  }

  return {
    messages,
    todoTasks,
    isLoading,
    error,
    currentStreamingMessageId,
    pendingApprovals,
    pendingQuestions,
    messageQueue,
    isProcessingQueue,
    getConversationRuntimeState,
    clearConversationRuntimeState,
    removeConversationRuntimeState,
    applyConversationData,
    messagesToCoreMessages,
    addMessage,
    updateMessage,
    appendToMessage,
    appendReasoningToMessage,
    addToolCallToMessage,
    updateToolCallResult,
    appendToolCallOutput,
    appendDelegateDelta,
    setToolCallAwaitingApproval,
    setToolCallAwaitingQuestion,
    setToolCallExecuting,
    addPendingApproval,
    removePendingApproval,
    clearPendingApprovals,
    addPendingQuestion,
    removePendingQuestion,
    clearMessages,
    deleteMessagesFrom,
    setLoading,
    setError,
    clearError,
  }
}
