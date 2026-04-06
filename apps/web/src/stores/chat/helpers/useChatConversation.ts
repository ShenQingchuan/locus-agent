import type { Ref } from 'vue'
import { deleteConversation, updateConversation } from '@/api/conversations'
import { useWhitelistStore } from '@/stores/whitelist'

export interface ConversationHelpersDeps {
  currentConversationId: Ref<string | null>
  conversations: Ref<{ id: string, updatedAt: string | Date }[]>
  yoloMode: Ref<boolean>
  clearConversationRuntimeState: (id: string | null) => void
  removeConversationRuntimeState: (id: string) => void
  clearError: (id?: string | null) => void
  getConversationRuntimeState: (id: string) => void
  setToolCallExecuting: (toolCallId: string, conversationId: string) => void
  clearPendingApprovals: (conversationId: string) => void
  pendingApprovals: Ref<Map<string, unknown>>
  cancelEditMessage: () => void
  refreshConversationPlans: (id: string) => Promise<void>
  focusInputTrigger?: Ref<number>
}

export function useChatConversation(deps: ConversationHelpersDeps) {
  const whitelistStore = useWhitelistStore()

  function newConversation() {
    deps.cancelEditMessage()
    deps.currentConversationId.value = null
    deps.yoloMode.value = false
    deps.clearConversationRuntimeState(null)
    deps.focusInputTrigger && (deps.focusInputTrigger.value += 1)
  }

  function switchConversation(id: string) {
    if (id === deps.currentConversationId.value)
      return
    deps.cancelEditMessage()
    deps.currentConversationId.value = id
    deps.getConversationRuntimeState(id)
    deps.clearError(id)
    whitelistStore.loadWhitelistRules(id)
    void deps.refreshConversationPlans(id)
  }

  async function removeConversation(id: string): Promise<boolean> {
    const success = await deleteConversation(id)
    if (success) {
      deps.removeConversationRuntimeState(id)
      deps.conversations.value = deps.conversations.value.filter(c => c.id !== id)
      if (deps.currentConversationId.value === id) {
        const firstConversation = deps.conversations.value[0]
        if (firstConversation) {
          switchConversation(firstConversation.id)
        }
        else {
          newConversation()
        }
      }
    }
    return success
  }

  async function toggleYoloMode(): Promise<void> {
    const previousYoloMode = deps.yoloMode.value
    const nextYoloMode = !previousYoloMode
    const conversationId = deps.currentConversationId.value

    deps.yoloMode.value = nextYoloMode

    if (!conversationId)
      return

    const pendingToolCallIds = nextYoloMode
      ? [...deps.pendingApprovals.value.keys()]
      : []

    const updated = await updateConversation(conversationId, {
      confirmMode: !nextYoloMode,
    })

    if (!updated) {
      deps.yoloMode.value = previousYoloMode
      return
    }

    const conversationIndex = deps.conversations.value.findIndex(c => c.id === conversationId)
    if (conversationIndex !== -1) {
      deps.conversations.value[conversationIndex] = updated as any
    }

    if (nextYoloMode && pendingToolCallIds.length > 0) {
      for (const toolCallId of pendingToolCallIds) {
        deps.setToolCallExecuting(toolCallId, conversationId)
      }
      deps.clearPendingApprovals(conversationId)
    }
  }

  return {
    newConversation,
    switchConversation,
    removeConversation,
    toggleYoloMode,
  }
}
