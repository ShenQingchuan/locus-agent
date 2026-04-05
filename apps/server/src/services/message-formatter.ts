import type { MessageImageAttachment, ToolCall, ToolResult } from '@univedge/locus-agent-sdk'
import type { ModelMessage } from 'ai'
import type { AddMessageInput } from '../services/message.js'
import { Buffer } from 'node:buffer'
import { normalizeToolCallMessageSequence } from '../agent/loop/message-utils.js'

const RE_BASE64_DATA_URL = /^data:.*?;base64,(.+)$/

function toModelImagePayload(attachment: MessageImageAttachment): string | Uint8Array {
  const match = attachment.dataUrl.match(RE_BASE64_DATA_URL)
  if (!match?.[1])
    return attachment.dataUrl
  return Uint8Array.from(Buffer.from(match[1], 'base64'))
}

/**
 * 将用户消息转换为 CoreMessage 格式
 */
export function createUserMessage(content: string, attachments?: MessageImageAttachment[]): ModelMessage {
  if (!attachments || attachments.length === 0) {
    return {
      role: 'user',
      content,
    }
  }

  return {
    role: 'user',
    content: [
      ...(content.trim().length > 0 ? [{ type: 'text' as const, text: content }] : []),
      ...attachments.map(attachment => ({
        type: 'image' as const,
        image: toModelImagePayload(attachment),
        mimeType: attachment.mimeType,
      })),
    ],
  }
}

export function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
      // Ignore non-JSON strings and preserve them below.
    }
  }

  return args && typeof args === 'object' && !Array.isArray(args)
    ? args as Record<string, unknown>
    : { value: args }
}

export function buildAssistantMessageFromDbMessage(message: {
  content: string
  reasoning?: string | null
  toolCalls?: unknown[] | null
}): ModelMessage | null {
  const content: Array<
    | { type: 'reasoning', text: string }
    | { type: 'text', text: string }
    | { type: 'tool-call', toolCallId: string, toolName: string, input: Record<string, unknown> }
  > = []

  if (message.reasoning) {
    content.push({
      type: 'reasoning',
      text: message.reasoning,
    })
  }

  const toolCalls = message.toolCalls as Array<{ toolCallId: string, toolName: string, args: unknown }> | null
  if (toolCalls?.length) {
    for (const toolCall of toolCalls) {
      if (!toolCall?.toolCallId || !toolCall.toolName)
        continue
      content.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: normalizeToolArgs(toolCall.args),
      })
    }
  }

  if (message.content) {
    content.push({
      type: 'text',
      text: message.content,
    })
  }

  return content.length > 0
    ? {
        role: 'assistant',
        content,
      }
    : null
}

export function buildToolMessageFromDbMessage(message: {
  toolResults?: unknown[] | null
}): ModelMessage | null {
  const toolResults = message.toolResults as Array<{ toolCallId: string, toolName: string, result: unknown, isError?: boolean }> | null
  if (!toolResults?.length)
    return null

  const content = toolResults
    .filter(toolResult => toolResult?.toolCallId && toolResult.toolName)
    .map(toolResult => ({
      type: 'tool-result' as const,
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toolResult.isError
        ? { type: 'error-text' as const, value: typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result) }
        : { type: 'text' as const, value: typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result) },
    }))

  if (content.length === 0)
    return null

  return {
    role: 'tool',
    content,
  }
}

export function decodeToolOutput(output: {
  type: string
  value?: unknown
  reason?: string
}): {
  result: unknown
  isError?: boolean
} {
  switch (output.type) {
    case 'error-text':
      return {
        result: output.value ?? '',
        isError: true,
      }
    case 'error-json':
      return {
        result: output.value,
        isError: true,
      }
    case 'execution-denied':
      return {
        result: output.reason ?? 'Tool execution denied.',
        isError: true,
      }
    case 'json':
    case 'content':
    case 'text':
    default:
      return {
        result: output.value ?? '',
      }
  }
}

export function agentMessagesToDbInputs(
  messages: ModelMessage[],
  assistantModel: string,
  usage: AddMessageInput['usage'],
): AddMessageInput[] {
  const dbInputs: AddMessageInput[] = []

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        if (!message.content)
          continue
        dbInputs.push({
          role: 'assistant',
          content: message.content,
          model: assistantModel,
        })
        continue
      }

      let content = ''
      let reasoning = ''
      const toolCalls: ToolCall[] = []

      for (const part of message.content) {
        switch (part.type) {
          case 'text':
            content += part.text
            break
          case 'reasoning':
            reasoning += part.text
            break
          case 'tool-call':
            toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: normalizeToolArgs(part.input),
            })
            break
        }
      }

      if (!content && !reasoning && toolCalls.length === 0)
        continue

      dbInputs.push({
        role: 'assistant',
        content,
        reasoning: reasoning || undefined,
        model: assistantModel,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
      continue
    }

    if (message.role === 'tool' && Array.isArray(message.content)) {
      const toolResults: ToolResult[] = []

      for (const part of message.content) {
        if (part.type !== 'tool-result')
          continue
        const decoded = decodeToolOutput(part.output as { type: string, value?: unknown, reason?: string })
        toolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: decoded.result,
          isError: decoded.isError,
        })
      }

      if (toolResults.length === 0)
        continue

      dbInputs.push({
        role: 'tool',
        content: '',
        toolResults,
      })
    }
  }

  for (let i = dbInputs.length - 1; i >= 0; i--) {
    if (dbInputs[i]?.role === 'assistant') {
      dbInputs[i] = {
        ...dbInputs[i]!,
        usage,
      }
      break
    }
  }

  return dbInputs
}

/**
 * 将数据库 Message 记录转换为 AI SDK 的 ModelMessage[]
 */
export function dbMessagesToModelMessages(dbMsgs: Array<{
  role: string
  content: string
  attachments?: MessageImageAttachment[] | null
  reasoning?: string | null
  toolCalls?: unknown[] | null
  toolResults?: unknown[] | null
}>): ModelMessage[] {
  const result: ModelMessage[] = []
  for (const msg of dbMsgs) {
    switch (msg.role) {
      case 'user':
        result.push(createUserMessage(msg.content, msg.attachments ?? undefined))
        break
      case 'assistant': {
        const assistantMessage = buildAssistantMessageFromDbMessage(msg)
        if (assistantMessage)
          result.push(assistantMessage)
        break
      }
      case 'tool': {
        const toolMessage = buildToolMessageFromDbMessage(msg)
        if (toolMessage)
          result.push(toolMessage)
        break
      }
      case 'system':
        result.push({ role: 'system', content: msg.content })
        break
    }
  }
  return normalizeToolCallMessageSequence(result)
}
