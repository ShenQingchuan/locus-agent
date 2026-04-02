import type { PendingToolCall } from '@univedge/locus-agent-sdk'

interface ReasoningDeltaPart { type: 'reasoning-delta', text: string }
interface TextDeltaPart { type: 'text-delta', text: string }
interface ToolCallPart { type: 'tool-call', toolCallId: string, toolName: string, input: unknown }
interface FinishPart { type: 'finish', finishReason: string }
interface ErrorPart { type: 'error', error: unknown }

/** AI SDK stream part types that this consumer does not act on but may encounter. */
type IgnoredStreamPartType =
  | 'text-start' | 'text-end'
  | 'reasoning-start' | 'reasoning-end'
  | 'tool-input-start' | 'tool-input-end' | 'tool-input-delta'
  | 'tool-result' | 'tool-error' | 'tool-output-denied' | 'tool-approval-request'
  | 'source' | 'file' | 'raw'
  | 'start' | 'start-step' | 'finish-step'
  | 'abort'

type StreamPart
  = | ReasoningDeltaPart
    | TextDeltaPart
    | ToolCallPart
    | FinishPart
    | ErrorPart
    | { type: IgnoredStreamPartType }

interface StreamConsumeOptions {
  response: { fullStream: AsyncIterable<StreamPart> }
  abortSignal?: AbortSignal
  initialFinishReason: string
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onTextDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
}

interface StreamConsumeResult {
  iterationText: string
  iterationReasoning: string
  pendingToolCalls: PendingToolCall[]
  finishReason: string
}

function isReasoningDelta(part: unknown): part is ReasoningDeltaPart {
  return typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'reasoning-delta' && typeof (part as Record<string, unknown>).text === 'string'
}

function isToolCallPart(part: unknown): part is ToolCallPart {
  return typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'tool-call' && typeof (part as Record<string, unknown>).toolCallId === 'string' && typeof (part as Record<string, unknown>).toolName === 'string'
}

function isFinishPart(part: unknown): part is FinishPart {
  return typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'finish' && typeof (part as Record<string, unknown>).finishReason === 'string'
}

function isErrorPart(part: unknown): part is ErrorPart {
  return typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'error'
}

function isTextDeltaPart(part: unknown): part is TextDeltaPart {
  return typeof part === 'object' && part !== null && (part as Record<string, unknown>).type === 'text-delta' && typeof (part as Record<string, unknown>).text === 'string'
}

export async function consumeResponseStream(options: StreamConsumeOptions): Promise<StreamConsumeResult> {
  const {
    response,
    abortSignal,
    initialFinishReason,
    onReasoningDelta,
    onTextDelta,
    onToolCallStart,
  } = options

  let iterationText = ''
  let iterationReasoning = ''
  const pendingToolCalls: PendingToolCall[] = []
  const seenToolCallIds = new Set<string>()
  let finishReason = initialFinishReason

  for await (const part of response.fullStream) {
    if (abortSignal?.aborted) {
      finishReason = 'aborted'
      break
    }

    if (isReasoningDelta(part)) {
      iterationReasoning += part.text
      if (onReasoningDelta) {
        await onReasoningDelta(part.text)
      }
    }
    else if (isTextDeltaPart(part)) {
      iterationText += part.text
      if (onTextDelta) {
        await onTextDelta(part.text)
      }
    }
    else if (isToolCallPart(part)) {
      if (seenToolCallIds.has(part.toolCallId)) {
        console.warn(`[agent-loop] Duplicate tool-call event ignored: ${part.toolCallId}`)
        continue
      }
      seenToolCallIds.add(part.toolCallId)
      pendingToolCalls.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: part.input,
      })
      if (onToolCallStart) {
        await onToolCallStart(part.toolCallId, part.toolName, part.input)
      }
    }
    else if (isFinishPart(part)) {
      finishReason = part.finishReason
    }
    else if (isErrorPart(part)) {
      throw new Error(String(part.error))
    }
  }

  return {
    iterationText,
    iterationReasoning,
    pendingToolCalls,
    finishReason,
  }
}
