import type { PendingToolCall } from '@locus-agent/agent-sdk'

interface StreamConsumeOptions {
  response: { fullStream: AsyncIterable<any> }
  abortSignal?: AbortSignal
  initialFinishReason: string
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onTextDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
}

interface StreamConsumeResult {
  iterationText: string
  pendingToolCalls: PendingToolCall[]
  finishReason: string
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
  const pendingToolCalls: PendingToolCall[] = []
  const seenToolCallIds = new Set<string>()
  let finishReason = initialFinishReason

  for await (const part of response.fullStream) {
    if (abortSignal?.aborted) {
      finishReason = 'aborted'
      break
    }

    switch (part.type) {
      case 'reasoning-delta':
        if (onReasoningDelta) {
          await onReasoningDelta((part as any).text)
        }
        break

      case 'text-delta':
        iterationText += part.text
        if (onTextDelta) {
          await onTextDelta(part.text)
        }
        break

      case 'tool-call':
        if (seenToolCallIds.has(part.toolCallId)) {
          console.warn(`[agent-loop] Duplicate tool-call event ignored: ${part.toolCallId}`)
          break
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
        break

      case 'finish':
        finishReason = part.finishReason
        break

      case 'error':
        throw new Error(String(part.error))
    }
  }

  return {
    iterationText,
    pendingToolCalls,
    finishReason,
  }
}
