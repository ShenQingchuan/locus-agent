import type { PendingToolCall } from '@univedge/locus-agent-sdk'
import type { AssistantModelMessage, ModelMessage, ToolModelMessage } from 'ai'
import type { ExecuteToolPipelineResult } from './types.js'

type AssistantArrayMessage = AssistantModelMessage & {
  content: Exclude<AssistantModelMessage['content'], string>
}

type ToolArrayMessage = ToolModelMessage & {
  content: ToolModelMessage['content']
}

interface PendingToolSequence {
  assistant: AssistantArrayMessage
  toolMessages: ToolArrayMessage[]
}

function isAssistantArrayMessage(message: ModelMessage): message is AssistantArrayMessage {
  return message.role === 'assistant' && Array.isArray(message.content)
}

function isToolArrayMessage(message: ModelMessage): message is ToolArrayMessage {
  return message.role === 'tool' && Array.isArray(message.content)
}

function buildFilteredAssistantMessage(
  message: AssistantArrayMessage,
  matchedToolCallIds: Set<string>,
): AssistantArrayMessage | null {
  const filteredContent = message.content.filter((part) => {
    if (part.type !== 'tool-call')
      return true
    return matchedToolCallIds.has(part.toolCallId)
  })

  return filteredContent.length > 0
    ? {
        ...message,
        content: filteredContent,
      }
    : null
}

function finalizePendingToolSequence(
  normalized: ModelMessage[],
  pending: PendingToolSequence | null,
): void {
  if (!pending)
    return

  const matchedToolCallIds = new Set<string>()
  for (const toolMessage of pending.toolMessages) {
    for (const part of toolMessage.content) {
      if (part.type === 'tool-result') {
        matchedToolCallIds.add(part.toolCallId)
      }
    }
  }

  const assistantMessage = buildFilteredAssistantMessage(pending.assistant, matchedToolCallIds)
  if (assistantMessage) {
    normalized.push(assistantMessage)
  }

  if (matchedToolCallIds.size > 0) {
    normalized.push(...pending.toolMessages)
  }
}

export function buildAssistantStepMessage(options: {
  text: string
  reasoning: string
  pendingToolCalls: PendingToolCall[]
}): AssistantArrayMessage | null {
  const content: AssistantArrayMessage['content'] = []

  if (options.reasoning.length > 0) {
    content.push({
      type: 'reasoning',
      text: options.reasoning,
    })
  }

  for (const toolCall of options.pendingToolCalls) {
    content.push({
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.args,
    })
  }

  if (options.text.length > 0) {
    content.push({
      type: 'text',
      text: options.text,
    })
  }

  return content.length > 0
    ? {
        role: 'assistant',
        content,
      }
    : null
}

export function buildToolResultMessage(
  toolCall: PendingToolCall,
  pipelineResult: ExecuteToolPipelineResult,
): ToolArrayMessage {
  const resultText = pipelineResult.contextResult
    ?? (typeof pipelineResult.result === 'string'
      ? pipelineResult.result
      : JSON.stringify(pipelineResult.result))

  return {
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      output: pipelineResult.isError
        ? { type: 'error-text', value: resultText }
        : { type: 'text', value: resultText },
    }],
  }
}

export function normalizeToolCallMessageSequence(messages: ModelMessage[]): ModelMessage[] {
  const normalized: ModelMessage[] = []
  let pending: PendingToolSequence | null = null

  for (const message of messages) {
    if (isAssistantArrayMessage(message)) {
      finalizePendingToolSequence(normalized, pending)
      pending = null

      const hasToolCalls = message.content.some(part => part.type === 'tool-call')
      if (!hasToolCalls) {
        normalized.push(message)
        continue
      }

      pending = {
        assistant: message,
        toolMessages: [],
      }
      continue
    }

    if (isToolArrayMessage(message)) {
      if (!pending)
        continue

      const pendingToolCallIds = new Set(
        pending.assistant.content
          .filter(part => part.type === 'tool-call')
          .map(part => part.toolCallId),
      )

      const filteredContent = message.content.filter((part) => {
        if (part.type !== 'tool-result')
          return false
        return pendingToolCallIds.has(part.toolCallId)
      })

      if (filteredContent.length === 0)
        continue

      pending.toolMessages.push({
        ...message,
        content: filteredContent,
      })
      continue
    }

    finalizePendingToolSequence(normalized, pending)
    pending = null
    normalized.push(message)
  }

  finalizePendingToolSequence(normalized, pending)
  return normalized
}
