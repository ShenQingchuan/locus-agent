import type { Conversation, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { ComputedRef, Ref } from 'vue'
import { useQueryCache } from '@pinia/colada'
import { useToast } from '@univedge/locus-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getConversationListQueryKey, useConversationListQuery, useConversationQuery } from '@/composables/queries'
import { getTasksListQueryKey } from '@/composables/taskQueries'
import { provideMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useChatStore } from '@/stores/chat'

export function useCodingViewChat(
  codingScope: ComputedRef<{ space: 'coding', projectKey?: string, workspaceRoot?: string }>,
  currentProjectKey: Ref<string | undefined>,
  canUseAssistant: ComputedRef<boolean>,
  activeSection: Ref<'chat' | 'planning' | 'workspace'>,
) {
  const toast = useToast()
  const route = useRoute()
  const router = useRouter()
  const chatStore = useChatStore()
  const queryCache = useQueryCache()

  const isHistoryOpen = ref(false)
  const dirtyConversations = new Set<string>()

  provideMarkConversationDirty((conversationId: string) => {
    dirtyConversations.add(conversationId)
  })

  const { data: conversationsData, isPending: isLoadingConversations } = useConversationListQuery(() => codingScope.value)
  const { data: conversationData } = useConversationQuery(() => chatStore.currentConversationId)

  watch(() => chatStore.currentConversationId, (id) => {
    const q = route.query
    if (id) {
      if (q.conversation !== id)
        router.replace({ query: { ...q, conversation: id } })
    }
    else if (q.conversation) {
      const { conversation: _, ...rest } = q
      router.replace({ query: rest })
    }
  })

  watch(conversationsData, (data) => {
    if (data) {
      chatStore.conversations = data
    }
  }, { immediate: true })

  watch(conversationData, (data) => {
    const activeConversationId = chatStore.currentConversationId
    if (!activeConversationId)
      return
    if (data && data.conversation.id !== activeConversationId)
      return
    if (chatStore.isLoading || chatStore.isStreaming)
      return
    if (data) {
      chatStore.applyConversationData(data, activeConversationId)
    }
    else if (data === null) {
      chatStore.newConversation()
    }
  })

  watch(() => chatStore.currentConversationId, (_newId, oldId) => {
    if (oldId && dirtyConversations.has(oldId)) {
      queryCache.invalidateQueries({ key: ['conversation', oldId] })
      dirtyConversations.delete(oldId)
    }
  })

  async function handleSend(payload: { content: string, attachments: MessageImageAttachment[] }) {
    if ((!payload.content.trim() && payload.attachments.length === 0) || !canUseAssistant.value)
      return
    const targetConversationId = await chatStore.sendMessage(payload.content, undefined, undefined, {
      attachments: payload.attachments,
    })
    if (targetConversationId) {
      dirtyConversations.add(targetConversationId)
    }
    queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })
  }

  function handleStop() {
    chatStore.stopGeneration()
  }

  function handleSelectConversation(id: string) {
    chatStore.switchConversation(id)
    activeSection.value = 'chat'
    isHistoryOpen.value = false
  }

  function toggleHistory() {
    if (!canUseAssistant.value)
      return
    isHistoryOpen.value = !isHistoryOpen.value
  }

  async function handleDeleteConversation(id: string) {
    const confirmed = await toast.confirm({
      title: '删除对话',
      message: '确定要删除这个对话吗？删除后无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'error',
    })
    if (!confirmed)
      return
    await chatStore.removeConversation(id)
    queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })
    toast.success('对话已删除')
  }

  async function handleNewConversation() {
    if (!canUseAssistant.value)
      return
    isHistoryOpen.value = false
    await nextTick()
    chatStore.newConversation()
    activeSection.value = 'chat'
  }

  const currentProjectConversations = computed<Conversation[]>(() => chatStore.conversations)

  const recentConversations = computed(() => {
    if (!canUseAssistant.value)
      return []
    return currentProjectConversations.value.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)
  })

  const manageKanbanResultCount = computed(() => {
    return chatStore.messages.reduce((count, message) => {
      if (!message.toolCalls || message.toolCalls.length === 0)
        return count
      return count + message.toolCalls.filter(toolCallState =>
        toolCallState.toolCall.toolName === 'manage_kanban' && !!toolCallState.result,
      ).length
    }, 0)
  })

  watch(manageKanbanResultCount, (current, previous) => {
    if (current <= previous)
      return
    if (!currentProjectKey.value)
      return
    queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
  })

  return {
    isHistoryOpen,
    dirtyConversations,
    isLoadingConversations,
    conversationsData,
    handleSend,
    handleStop,
    handleSelectConversation,
    toggleHistory,
    handleDeleteConversation,
    handleNewConversation,
    currentProjectConversations,
    recentConversations,
    manageKanbanResultCount,
  }
}
