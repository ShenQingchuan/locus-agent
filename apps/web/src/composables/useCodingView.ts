import { getDefaultCodingExecutorForProvider } from '@univedge/locus-agent-sdk'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { usePlanStore } from '@/stores/plan'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCodingViewChat } from './coding-view/useCodingViewChat'
import { useCodingViewGit } from './coding-view/useCodingViewGit'
import { useCodingViewWorkspace } from './coding-view/useCodingViewWorkspace'

export function useCodingView() {
  const workspace = useCodingViewWorkspace()
  const chat = useCodingViewChat(
    workspace.codingScope,
    workspace.currentProjectKey,
    workspace.canUseAssistant,
    workspace.activeSection,
  )
  const git = useCodingViewGit(
    workspace.currentProjectPath,
    workspace.activeSection,
    workspace.isCodingViewActive,
    workspace.currentProjectKey,
  )

  // Auto-enable coding executor when entering coding space
  const modelSettings = useModelSettingsStore()
  const { codingExecutor, provider } = storeToRefs(modelSettings)
  const planStore = usePlanStore()
  const chatStore = useChatStore()
  const workspaceStore = useWorkspaceStore()

  watch(workspace.codingScope, (scope) => {
    if (scope.space === 'coding') {
      const suggested = getDefaultCodingExecutorForProvider(provider.value)
      if (suggested && !codingExecutor.value)
        codingExecutor.value = suggested
    }
    else {
      codingExecutor.value = null
    }
  })

  // Refresh git status when entering workspace section
  watch(workspace.activeSection, (section) => {
    if (section === 'workspace' && workspace.currentProjectKey.value) {
      git.gitStatus.refresh()
    }
  })

  return {
    // Workspace / UI
    activeSection: workspace.activeSection,
    currentProjectKey: workspace.currentProjectKey,
    kanbanBoardRef: workspace.kanbanBoardRef,
    isHistoryOpen: chat.isHistoryOpen,
    isCommitDialogOpen: git.isCommitDialogOpen,
    isLeftSidebarCollapsed: workspace.isLeftSidebarCollapsed,
    leftPanelWidth: workspace.leftPanelWidth,
    leftPanelRef: workspace.leftPanelRef,
    isLeftPanelResizing: workspace.isLeftPanelResizing,
    handleLeftPanelResizeStart: workspace.handleLeftPanelResizeStart,
    canUseAssistant: workspace.canUseAssistant,
    isWorkspaceLoading: workspace.isWorkspaceLoading,

    // Stores (exposed for template direct access)
    chatStore,
    planStore,
    workspaceStore,

    // Git
    gitStatus: git.gitStatus,
    isGitStatusUpdating: git.isGitStatusUpdating,
    handleCommit: git.handleCommit,
    handleCommitConfirm: git.handleCommitConfirm,
    handlePush: git.handlePush,
    handleDiscard: git.handleDiscard,

    // Chat / Conversations
    isLoadingConversations: chat.isLoadingConversations,
    handleSend: chat.handleSend,
    handleStop: chat.handleStop,
    handleSelectConversation: chat.handleSelectConversation,
    toggleHistory: chat.toggleHistory,
    handleDeleteConversation: chat.handleDeleteConversation,
    handleNewConversation: chat.handleNewConversation,
    currentProjectConversations: chat.currentProjectConversations,
    recentConversations: chat.recentConversations,
  }
}
