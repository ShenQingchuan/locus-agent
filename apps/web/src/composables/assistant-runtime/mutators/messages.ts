import type { ConversationRuntimeState, Message } from '../types'

export function createMessageMutators(
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState,
) {
  function addMessage(
    message: Omit<Message, 'id' | 'timestamp'>,
    conversationId: string | null | undefined,
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
    conversationId: string | null | undefined,
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
    conversationId: string | null | undefined,
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
    conversationId: string | null | undefined,
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

  return {
    addMessage,
    updateMessage,
    appendToMessage,
    appendReasoningToMessage,
  }
}
