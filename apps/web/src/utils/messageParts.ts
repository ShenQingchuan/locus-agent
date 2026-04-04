import type { Message, MessagePart, ToolCallState } from '@/composables/assistant-runtime'

export function getDisplayParts(message: Message): MessagePart[] {
  if (message.parts && message.parts.length > 0)
    return message.parts

  const parts: MessagePart[] = []
  if (message.toolCalls?.length) {
    message.toolCalls.forEach((_, i) => parts.push({ type: 'tool-call', toolCallIndex: i }))
  }
  if (message.content) {
    parts.push({ type: 'text', content: message.content })
  }
  return parts
}

export function getToolCallSlice(message: Message, toolCallIndex: number): ToolCallState[] {
  const tool = message.toolCalls?.[toolCallIndex]
  return tool ? [tool] : []
}

export function isLastTextPart(parts: MessagePart[], partIndex: number): boolean {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]?.type === 'text')
      return i === partIndex
  }
  return false
}
