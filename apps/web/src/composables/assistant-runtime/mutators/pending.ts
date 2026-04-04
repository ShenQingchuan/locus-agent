import type { ConversationRuntimeState } from '../types'
import type { PendingApproval, PendingQuestion } from '@/api/chat'

export function createPendingMutators(
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState,
) {
  function addPendingApproval(
    approval: PendingApproval,
    conversationId: string | null | undefined,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.set(approval.toolCallId, approval)
  }

  function removePendingApproval(
    toolCallId: string,
    conversationId: string | null | undefined,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.delete(toolCallId)
  }

  function clearPendingApprovals(conversationId: string | null | undefined) {
    getConversationRuntimeState(conversationId).pendingApprovals.clear()
  }

  function addPendingQuestion(
    question: PendingQuestion,
    conversationId: string | null | undefined,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.set(question.toolCallId, question)
  }

  function removePendingQuestion(
    toolCallId: string,
    conversationId: string | null | undefined,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.delete(toolCallId)
  }

  return {
    addPendingApproval,
    removePendingApproval,
    clearPendingApprovals,
    addPendingQuestion,
    removePendingQuestion,
  }
}
