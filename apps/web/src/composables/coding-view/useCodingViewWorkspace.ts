import type KanbanBoard from '@/components/kanban/KanbanBoard.vue'
import { useQueryCache } from '@pinia/colada'
import { useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as workspaceApi from '@/api/workspace'
import { getConversationListQueryKey } from '@/composables/queries'
import { getTasksListQueryKey } from '@/composables/taskQueries'
import { useResizePanel } from '@/composables/useResizePanel'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
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

export function useCodingViewWorkspace() {
  const activeSection = useLocalStorage<CodingSection>('locus-agent:coding-active-section', 'chat')
  const currentProjectKey = ref<string | undefined>()
  const isWorkspaceLoading = ref(false)
  const kanbanBoardRef = ref<InstanceType<typeof KanbanBoard> | null>(null)
  const isLeftSidebarCollapsed = useLocalStorage('locus-agent:coding-left-sidebar-collapsed', false)
  const hasHandledFirstActivation = ref(false)
  const isCodingViewActive = ref(true)

  const route = useRoute()
  const chatStore = useChatStore()
  const modelSettings = useModelSettingsStore()
  const workspaceStore = useWorkspaceStore()
  const queryCache = useQueryCache()

  const currentProjectPath = computed(() => workspaceStore.currentWorkspacePath)

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

  watch(codingScope, (scope) => {
    chatStore.setConversationScope(scope)
  }, { immediate: true })

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
  })

  onDeactivated(() => {
    isCodingViewActive.value = false
  })

  return {
    activeSection,
    currentProjectKey,
    isWorkspaceLoading,
    kanbanBoardRef,
    isLeftSidebarCollapsed,
    isCodingViewActive,
    currentProjectPath,
    leftPanelWidth,
    leftPanelRef,
    isLeftPanelResizing,
    handleLeftPanelResizeStart,
    codingScope,
    canUseAssistant,
    initWorkspaceProjectKey,
  }
}
