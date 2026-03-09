import type { DelegateDelta, SSEEvent } from '../types/sse-events.js'
import type { ToolCall, ToolResult } from '../types/tool.js'
import type { RiskLevel } from '../types/whitelist.js'
import { parseSSELine } from './parser.js'

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  suggestedPattern?: string
  riskLevel?: RiskLevel
}

export interface PendingQuestion {
  toolCallId: string
  questions: Array<{
    question: string
    options: string[]
    multiple?: boolean
  }>
}

export interface ParsedDelegateDelta {
  toolCallId: string
  delta: DelegateDelta
}

export interface SSEEventHandlers {
  onReasoningDelta?: (delta: string) => void
  onTextDelta?: (delta: string) => void
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallResult?: (toolResult: ToolResult) => void
  onToolPendingApproval?: (approval: PendingApproval) => void
  onQuestionPending?: (question: PendingQuestion) => void
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void
  onDelegateDelta?: (event: ParsedDelegateDelta) => void
  onDone?: (messageId: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number }, model?: string) => void
  onError?: (code: string, message: string) => void
}

/**
 * Dispatch a parsed SSE event to the appropriate handler callback.
 */
export function dispatchSSEEvent(event: SSEEvent, handlers: SSEEventHandlers): void {
  switch (event.type) {
    case 'reasoning-delta':
      handlers.onReasoningDelta?.(event.reasoningDelta)
      break
    case 'text-delta':
      handlers.onTextDelta?.(event.textDelta)
      break
    case 'tool-call-start':
      handlers.onToolCallStart?.(event.toolCall)
      break
    case 'tool-call-result':
      handlers.onToolCallResult?.(event.toolResult)
      break
    case 'tool-pending-approval':
      handlers.onToolPendingApproval?.({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        suggestedPattern: event.suggestedPattern,
        riskLevel: event.riskLevel,
      })
      break
    case 'question-pending':
      handlers.onQuestionPending?.({
        toolCallId: event.toolCallId,
        questions: event.questions,
      })
      break
    case 'tool-output-delta':
      handlers.onToolOutputDelta?.(event.toolCallId, event.stream, event.delta)
      break
    case 'delegate-delta':
      handlers.onDelegateDelta?.({ toolCallId: event.toolCallId, delta: event.delta } satisfies ParsedDelegateDelta)
      break
    case 'done':
      handlers.onDone?.(event.messageId, event.usage, event.model)
      break
    case 'error':
      handlers.onError?.(event.code, event.message)
      break
  }
}

/**
 * Consume a ReadableStream of SSE data, parsing lines and dispatching events.
 * Handles buffering of partial lines across chunks.
 */
export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: SSEEventHandlers,
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed)
        continue

      const event = parseSSELine(trimmed)
      if (event) {
        dispatchSSEEvent(event, handlers)
      }
    }
  }

  if (buffer.trim()) {
    const event = parseSSELine(buffer.trim())
    if (event) {
      dispatchSSEEvent(event, handlers)
    }
  }
}
