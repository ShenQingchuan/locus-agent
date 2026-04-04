import type { AddToWhitelistPayload } from '@univedge/locus-agent-sdk'
import type { Ref } from 'vue'
import type { QuestionAnswer } from '@/api/chat'
import type { AssistantRuntimeManager } from '@/composables/assistant-runtime'
import { answerQuestion, approveToolCall } from '@/api/chat'
import { useWhitelistStore } from '@/stores/whitelist'

export function useChatToolApproval(
  currentConversationId: Ref<string | null>,
  yoloMode: Ref<boolean>,
  runtime: Pick<AssistantRuntimeManager, 'removePendingApproval'
  | 'setToolCallExecuting'
  | 'removePendingQuestion'
  | 'clearPendingApprovals'>,
) {
  async function handleToolApproval(toolCallId: string, approved: boolean) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return false

    runtime.removePendingApproval(toolCallId, conversationId)
    if (approved)
      runtime.setToolCallExecuting(toolCallId, conversationId)

    const switchToYolo = approved && yoloMode.value ? true : undefined
    const success = await approveToolCall(conversationId, toolCallId, approved, switchToYolo)
    return success
  }

  async function approveToolExecution(toolCallId: string) {
    return handleToolApproval(toolCallId, true)
  }

  async function rejectToolExecution(toolCallId: string) {
    return handleToolApproval(toolCallId, false)
  }

  async function approveAndWhitelist(toolCallId: string, payload: AddToWhitelistPayload) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return false

    runtime.removePendingApproval(toolCallId, conversationId)
    runtime.setToolCallExecuting(toolCallId, conversationId)

    const success = await approveToolCall(
      conversationId,
      toolCallId,
      true,
      undefined,
      payload,
    )

    if (success) {
      const whitelistStore = useWhitelistStore()
      await whitelistStore.loadWhitelistRules(conversationId)
    }
    return success
  }

  async function submitQuestionAnswer(toolCallId: string, answers: QuestionAnswer[]) {
    const conversationId = currentConversationId.value
    runtime.removePendingQuestion(toolCallId, conversationId)
    runtime.setToolCallExecuting(toolCallId, conversationId)

    const success = await answerQuestion(toolCallId, answers)
    return success
  }

  return {
    handleToolApproval,
    approveToolExecution,
    rejectToolExecution,
    approveAndWhitelist,
    submitQuestionAnswer,
  }
}
