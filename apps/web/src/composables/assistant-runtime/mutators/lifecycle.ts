import type { AssistantError, ConversationRuntimeState } from '../types'

export function createLifecycleMutators(
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState,
) {
  function clearMessages(conversationId: string | null | undefined) {
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

  function deleteMessagesFrom(messageId: string, conversationId: string | null | undefined): boolean {
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

  function setLoading(loading: boolean, conversationId: string | null | undefined) {
    getConversationRuntimeState(conversationId).isLoading = loading
  }

  function setError(err: AssistantError, conversationId: string | null | undefined) {
    getConversationRuntimeState(conversationId).error = err
  }

  function clearError(conversationId: string | null | undefined) {
    getConversationRuntimeState(conversationId).error = null
  }

  return {
    clearMessages,
    deleteMessagesFrom,
    setLoading,
    setError,
    clearError,
  }
}
