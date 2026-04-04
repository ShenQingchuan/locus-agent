import type { Conversation, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type KanbanBoard from '@/components/kanban/KanbanBoard.vue'
import { useQueryCache } from '@pinia/colada'
import { useToast } from '@univedge/locus-ui'
import { useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as workspaceApi from '@/api/workspace'
import { getConversationListQueryKey, useConversationListQuery, useConversationQuery } from '@/composables/queries'
import { getTasksListQueryKey } from '@/composables/taskQueries'
import { provideMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useGitStatus } from '@/composables/useGitStatus'
import { useResizePanel } from '@/composables/useResizePanel'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { usePlanStore } from '@/stores/plan'
import { useWorkspaceStore } from '@/stores/workspace'
import { runWithLoadingState } from '@/utils/loadingState'
import { createProjectKey } from '@/utils/projectKey'

export type CodingSection = 'chat' | 'planning' | 'workspace'

const STORAGE_KEY_LEFT_PANEL_WIDTH = 'locus-agent:coding-left-panel-width'

function getStoredPanelWidth(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined')
    return fallback

  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored)
      return fallback
    const parsed = Number.parseInt(stored, 10)
    if (Number.isNaN(parsed))
      return fallback
    return Math.max(min, Math.min(max, parsed))
  }
  catch {
    return fallback
  }
}

export function useCodingView() {
  const activeSection = useLocalStorage<CodingSection>('locus-agent:coding-active-section', 'chat')
  const currentProjectKey = ref<string | undefined>()
  const isWorkspaceLoading = ref(false)
  const kanbanBoardRef = ref<InstanceType<typeof KanbanBoard> | null>(null)
  const isHistoryOpen = ref(false)
  const isCommitDialogOpen = ref(false)
  const isLeftSidebarCollapsed = useLocalStorage('locus-agent:coding-left-sidebar-collapsed', false)
  const dirtyConversations = new Set<string>()

  const toast = useToast()
  const route = useRoute()
  const router = useRouter()
  const chatStore = useChatStore()
  const modelSettings = useModelSettingsStore()
  const planStore = usePlanStore()
  const workspaceStore = useWorkspaceStore()
  const queryCache = useQueryCache()
  const isCodingViewActive = ref(true)
  const currentProjectPath = computed(() => workspaceStore.currentWorkspacePath)
  const gitStatus = useGitStatus(currentProjectPath, isCodingViewActive)

  const leftPanel = useResizePanel({
    initialWidth: getStoredPanelWidth(STORAGE_KEY_LEFT_PANEL_WIDTH, 160, 160, 320),
    minWidth: 160,
    maxWidth: 320,
    onWidthChange: (width) => {
      localStorage.setItem(STORAGE_KEY_LEFT_PANEL_WIDTH, String(width))
    },
  })

  const {
    width: leftPanelWidth,
    panelRef: leftPanelRef,
    isResizing: isLeftPanelResizing,
    handleMouseDown: handleLeftPanelResizeStart,
  } = leftPanel

  const codingScope = computed(() => ({
    space: 'coding' as const,
    projectKey: currentProjectKey.value,
    workspaceRoot: workspaceStore.currentWorkspacePath || undefined,
  }))

  const canUseAssistant = computed(() => !!currentProjectKey.value)
  const hasHandledFirstActivation = ref(false)

  const isGitStatusUpdating = computed(
    () => activeSection.value === 'workspace'
      && (gitStatus.isLoading.value || gitStatus.isRefreshing.value),
  )

  provideMarkConversationDirty((conversationId: string) => {
    dirtyConversations.add(conversationId)
  })

  const { data: conversationsData, isPending: isLoadingConversations } = useConversationListQuery(() => codingScope.value)
  const { data: conversationData } = useConversationQuery(() => chatStore.currentConversationId)

  watch(codingScope, (scope) => {
    chatStore.setConversationScope(scope)
  }, { immediate: true })

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

  async function initWorkspaceProjectKey() {
    const savedPath = workspaceStore.currentWorkspacePath.trim()
    if (!savedPath) {
      currentProjectKey.value = undefined
      return
    }

    try {
      await runWithLoadingState(isWorkspaceLoading, async () => {
        const result = await workspaceApi.openWorkspace(savedPath)
        const projectKey = await createProjectKey(result.rootPath)
        currentProjectKey.value = projectKey
      })
    }
    catch {
      workspaceStore.closeWorkspace()
      currentProjectKey.value = undefined
    }
  }

  function refreshCodingDataOnActivate() {
    if (!currentProjectKey.value)
      return

    queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })

    if (chatStore.currentConversationId && !chatStore.isLoading && !chatStore.isStreaming) {
      queryCache.invalidateQueries({ key: ['conversation', chatStore.currentConversationId] })
    }

    queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
  }

  watch(() => workspaceStore.currentWorkspacePath, async (newPath) => {
    if (newPath.trim()) {
      await initWorkspaceProjectKey()
    }
    else {
      currentProjectKey.value = undefined
    }
  })

  onMounted(async () => {
    await modelSettings.loadModelSettings()
    await initWorkspaceProjectKey()
    await nextTick()
    const conversationId = route.query.conversation as string | undefined
    if (conversationId) {
      chatStore.switchConversation(conversationId)
      activeSection.value = 'chat'
    }
  })

  onActivated(async () => {
    isCodingViewActive.value = true
    chatStore.setConversationScope(codingScope.value)

    if (!hasHandledFirstActivation.value) {
      hasHandledFirstActivation.value = true
      return
    }

    if (!currentProjectKey.value && workspaceStore.currentWorkspacePath.trim() && !isWorkspaceLoading.value) {
      await initWorkspaceProjectKey()
    }

    refreshCodingDataOnActivate()

    if (activeSection.value === 'workspace' && currentProjectKey.value) {
      gitStatus.refresh()
    }
  })

  onDeactivated(() => {
    isCodingViewActive.value = false
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

  function handleCommit() {
    isCommitDialogOpen.value = true
  }

  async function handleCommitConfirm(message: string) {
    isCommitDialogOpen.value = false
    try {
      const result = await gitStatus.commit(message)
      if (result?.success) {
        toast.success('提交成功')
      }
      else {
        toast.error(result?.message || '提交失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '提交失败')
    }
  }

  async function handlePush() {
    const confirmed = await toast.confirm({
      title: '推送到远程',
      message: '确定要将本地提交推送到远程仓库吗？',
      confirmText: '推送',
      cancelText: '取消',
    })
    if (!confirmed)
      return

    try {
      const result = await gitStatus.push()
      if (result?.success) {
        toast.success('推送成功')
      }
      else {
        toast.error(result?.message || '推送失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '推送失败')
    }
  }

  async function handleDiscard() {
    const confirmed = await toast.confirm({
      title: '回滚全部变更',
      message: '此操作将撤销所有未提交的变更，且无法恢复。确定继续？',
      confirmText: '回滚',
      cancelText: '取消',
      type: 'error',
    })
    if (!confirmed)
      return

    try {
      const result = await gitStatus.discard()
      if (result?.success) {
        toast.success('已回滚全部变更')
      }
      else {
        toast.error(result?.message || '回滚失败')
      }
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : '回滚失败')
    }
  }

  watch(() => chatStore.isStreaming, (cur, prev) => {
    if (prev && !cur) {
      setTimeout(() => gitStatus.refresh(), 500)
      if (currentProjectKey.value) {
        queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
      }
    }
  })

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
    activeSection,
    currentProjectKey,
    isWorkspaceLoading,
    kanbanBoardRef,
    isHistoryOpen,
    isCommitDialogOpen,
    isLeftSidebarCollapsed,
    chatStore,
    modelSettings,
    planStore,
    workspaceStore,
    gitStatus,
    leftPanelWidth,
    leftPanelRef,
    isLeftPanelResizing,
    handleLeftPanelResizeStart,
    codingScope,
    canUseAssistant,
    isGitStatusUpdating,
    isLoadingConversations,
    conversationsData,
    handleSend,
    handleStop,
    handleSelectConversation,
    toggleHistory,
    handleDeleteConversation,
    handleNewConversation,
    handleCommit,
    handleCommitConfirm,
    handlePush,
    handleDiscard,
    currentProjectConversations,
    recentConversations,
  }
}
