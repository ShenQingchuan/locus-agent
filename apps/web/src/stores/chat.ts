import type { Conversation, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { ActiveDelegate } from '@/composables/assistant-runtime/types'
import { getDefaultCodingExecutorForProvider } from '@univedge/locus-agent-sdk'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { createAssistantRuntimeManager } from '@/composables/assistant-runtime'
import { createConversationMessagingActions } from '@/composables/useConversationMessaging'
import { createConversationScopeState } from '@/composables/useConversationScopeState'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { usePlanStore } from '@/stores/plan'
import { useWhitelistStore } from '@/stores/whitelist'
import { useChatConversation } from './chat/helpers/useChatConversation'
import { useChatPlanExecution } from './chat/helpers/useChatPlanExecution'
import { useChatConversationTitle } from './chat/useChatConversationTitle'
import { useChatMessageEditing } from './chat/useChatMessageEditing'
import { useChatPlanBridge } from './chat/useChatPlanBridge'
import { useChatSidebar } from './chat/useChatSidebar'
import { useChatTokenTracking } from './chat/useChatTokenTracking'
import { useChatToolApproval } from './chat/useChatToolApproval'

export const useChatStore = defineStore('chat', () => {
  // Conversation management
  const conversations = ref<Conversation[]>([])
  const scopeState = createConversationScopeState()
  const {
    currentConversationId,
    conversationScope,
    yoloMode,
    setConversationScope: setConversationScopeState,
  } = scopeState

  const runtime = createAssistantRuntimeManager({
    currentConversationId,
    onConversationDataApplied: ({ conversationId, conversation }) => {
      if (conversationId === currentConversationId.value)
        yoloMode.value = conversation.confirmMode === false
    },
  })

  const {
    messages,
    todoTasks,
    isLoading,
    error,
    currentStreamingMessageId,
    pendingApprovals,
    pendingQuestions,
    messageQueue,
    isProcessingQueue,
    getConversationRuntimeState,
    clearConversationRuntimeState,
    removeConversationRuntimeState,
    applyConversationData,
    messagesToCoreMessages,
    addMessage,
    updateMessage,
    appendToMessage,
    appendReasoningToMessage,
    addToolCallToMessage,
    updateToolCallResult,
    appendToolCallOutput,
    appendDelegateDelta,
    setToolCallAwaitingApproval,
    setToolCallAwaitingQuestion,
    setToolCallExecuting,
    addPendingApproval,
    removePendingApproval,
    clearPendingApprovals,
    addPendingQuestion,
    removePendingQuestion,
    clearMessages,
    setLoading,
    setError,
    clearError,
  } = runtime

  function setConversationScope(scope: Parameters<typeof setConversationScopeState>[0]) {
    setConversationScopeState(scope, {
      onNoActiveConversation: () => {
        clearConversationRuntimeState(null)
      },
    })
  }

  // Delegated stores
  const modelSettingsStore = useModelSettingsStore()
  const planStore = usePlanStore()
  const whitelistStore = useWhitelistStore()

  const {
    thinkMode,
    provider,
    modelName,
    customMode,
    isSavingModelSettings,
    codingExecutor,
    MAX_CONTEXT_TOKENS,
  } = storeToRefs(modelSettingsStore)
  const {
    toggleThinkMode,
    estimateCoreMessageTokens,
    loadModelSettings,
    saveModelSettings,
  } = modelSettingsStore

  const { codingMode } = storeToRefs(planStore)
  const {
    toggleCodingMode,
    setCodingMode,
    getPlanBindingPayload,
  } = planStore

  // Sub-modules
  const sidebar = useChatSidebar()
  const planBridge = useChatPlanBridge(currentConversationId)
  const tokenTracking = useChatTokenTracking(
    messages,
    messagesToCoreMessages,
    estimateCoreMessageTokens,
    MAX_CONTEXT_TOKENS,
  )
  const messageEditing = useChatMessageEditing(messages)
  const toolApproval = useChatToolApproval(
    currentConversationId,
    yoloMode,
    {
      removePendingApproval,
      setToolCallExecuting,
      removePendingQuestion,
      clearPendingApprovals,
    },
  )
  const conversationTitle = useChatConversationTitle(conversations)

  // Auto-enable the provider-affine coding executor when entering coding space
  watch(conversationScope, (scope) => {
    if (scope.space === 'coding') {
      const suggested = getDefaultCodingExecutorForProvider(provider.value)
      if (suggested && !codingExecutor.value)
        codingExecutor.value = suggested
    }
    else {
      codingExecutor.value = null
    }
  })

  /** 过滤掉 trigger 消息后的可见消息列表（用于 UI 渲染） */
  const visibleMessages = computed(() =>
    messages.value.filter(m => !m.metadata?.trigger),
  )

  const hasError = computed(() => error.value !== null)
  const isStreaming = computed(() => currentStreamingMessageId.value !== null)
  const hasPendingApprovals = computed(() => pendingApprovals.value.size > 0)
  const queuedMessageCount = computed(() => messageQueue.value.length)
  const completedTodoCount = computed(() => todoTasks.value.filter(t => t.status === 'completed').length)
  const inProgressTodoCount = computed(() => todoTasks.value.filter(t => t.status === 'in_progress').length)

  const activeDelegates = computed<ActiveDelegate[]>(() => {
    const msgs = messages.value
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg?.role !== 'assistant' || !msg.toolCalls?.length)
        continue
      const delegates = msg.toolCalls.filter(tc => tc.toolCall.toolName === 'delegate')
      if (delegates.length === 0)
        break
      return delegates.map((tc): ActiveDelegate => ({
        toolCallId: tc.toolCall.toolCallId,
        agentName: String(tc.toolCall.args?.agent_name ?? tc.toolCall.args?.agent_type ?? '子代理'),
        agentType: String(tc.toolCall.args?.agent_type ?? 'custom'),
        task: String(tc.toolCall.args?.task ?? ''),
        status: tc.status === 'completed'
          ? 'completed'
          : (tc.status === 'error' || tc.status === 'interrupted')
              ? 'error'
              : 'pending',
      }))
    }
    return []
  })

  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value),
  )

  const pendingJumpToolCallId = ref<string | null>(null)

  function jumpToDelegate(toolCallId: string) {
    pendingJumpToolCallId.value = toolCallId
  }

  function clearJumpTarget() {
    pendingJumpToolCallId.value = null
  }

  const focusInputTrigger = ref(0)

  /** Pending text for Coding chat composer (e.g. review annotations); applied when ChatInput mounts or updates. */
  const pendingComposerDraft = ref('')
  const composerDraftNonce = ref(0)

  function setComposerDraft(text: string) {
    pendingComposerDraft.value = text
    composerDraftNonce.value += 1
  }

  function clearComposerDraft() {
    pendingComposerDraft.value = ''
  }

  // Conversation lifecycle helpers
  const conversationHelpers = useChatConversation({
    currentConversationId,
    conversations,
    yoloMode,
    clearConversationRuntimeState,
    removeConversationRuntimeState,
    clearError,
    getConversationRuntimeState,
    setToolCallExecuting,
    clearPendingApprovals,
    pendingApprovals,
    cancelEditMessage: messageEditing.cancelEditMessage,
    refreshConversationPlans: planBridge.refreshConversationPlans,
    focusInputTrigger,
  })

  // Messaging actions
  const messaging = createConversationMessagingActions({
    state: {
      currentConversationId,
      conversationScope,
      yoloMode,
      thinkMode,
      codingMode,
      codingExecutor,
      provider,
      modelName,
      conversations,
    },
    runtime: {
      getConversationRuntimeState,
      messagesToCoreMessages,
      clearError,
      setError,
      setLoading,
      addMessage,
      updateMessage,
      appendReasoningToMessage,
      appendToMessage,
      addToolCallToMessage,
      updateToolCallResult,
      addPendingApproval,
      setToolCallAwaitingApproval,
      addPendingQuestion,
      setToolCallAwaitingQuestion,
      appendToolCallOutput,
      appendDelegateDelta,
    },
    callbacks: {
      generateTitle: conversationTitle.generateTitle,
      onWritePlanDetected: planBridge.onWritePlanDetected,
      onPlanPreviewStart: planBridge.onPlanPreviewStart,
      onPlanPreviewDelta: planBridge.onPlanPreviewDelta,
      onPlanPreviewDone: planBridge.onPlanPreviewDone,
      getPlanBinding: getPlanBindingPayload,
    },
  })

  const {
    sendMessage,
    removeFromQueue,
    editQueueItem,
    stopGeneration,
    saveEditMessage: saveEditedMessage,
    retryFromMessage,
    deleteMessagesFrom,
  } = messaging

  // Plan execution helper
  const planExecution = useChatPlanExecution({
    currentConversationId,
    latestPlanByConversation: planStore.latestPlanByConversation,
    currentPlan: planBridge.currentPlan,
    useAutoPlanBinding: planBridge.useAutoPlanBinding,
    setCodingMode,
    sendMessage,
  })

  // Whitelist actions delegated to useWhitelistStore
  const { whitelistRules, loadWhitelistRules, removeWhitelistRule } = whitelistStore

  async function saveEditMessage(messageId: string, newContent: string, newAttachments: MessageImageAttachment[]): Promise<string | null> {
    messageEditing.editingMessageId.value = null
    messageEditing.editingContent.value = ''
    messageEditing.editingAttachments.value = []
    return saveEditedMessage(messageId, newContent, newAttachments)
  }

  const {
    editingMessageId,
    editingContent,
    editingAttachments,
    startEditMessage,
    cancelEditMessage,
  } = messageEditing

  const {
    isSidebarCollapsed,
    sidebarWidth,
    toggleSidebar,
    setSidebarWidth,
  } = sidebar

  const {
    currentPlan,
    isLoadingPlan,
    viewingPlan,
    currentPlanBinding,
    activeBoundPlanFilename,
    setPlanBinding,
    unbindPlan,
    useAutoPlanBinding,
    refreshConversationPlans,
    openCurrentPlan,
    openPlan,
    closePlan,
  } = planBridge

  const {
    contextTokensUsed,
    contextUsagePercentage,
  } = tokenTracking

  const {
    handleToolApproval,
    approveToolExecution,
    rejectToolExecution,
    approveAndWhitelist,
    submitQuestionAnswer,
  } = toolApproval

  const {
    generateTitle,
    updateTitle,
  } = conversationTitle

  return {
    // Conversation management state
    conversations,
    currentConversationId,
    conversationScope,
    isSidebarCollapsed,
    sidebarWidth,
    yoloMode,
    thinkMode,
    codingMode,
    currentPlan,
    isLoadingPlan,
    currentPlanBinding,
    activeBoundPlanFilename,
    viewingPlan,
    provider,
    modelName,
    customMode,
    isSavingModelSettings,
    codingExecutor,

    // Current conversation state
    messages,
    visibleMessages,
    todoTasks,
    isLoading,
    error,
    currentStreamingMessageId,
    pendingApprovals,
    pendingQuestions,
    whitelistRules,

    // Message queue state
    messageQueue,
    isProcessingQueue,

    // Edit message state
    editingMessageId,
    editingContent,
    editingAttachments,

    // Focus input trigger
    focusInputTrigger,

    // Composer draft (Coding /review → chat input)
    pendingComposerDraft,
    composerDraftNonce,
    setComposerDraft,
    clearComposerDraft,

    // Computed
    hasError,
    isStreaming,
    hasPendingApprovals,
    queuedMessageCount,
    completedTodoCount,
    inProgressTodoCount,
    activeDelegates,
    pendingJumpToolCallId,
    jumpToDelegate,
    clearJumpTarget,
    currentConversation,
    contextTokensUsed,
    contextUsagePercentage,
    MAX_CONTEXT_TOKENS,

    // Conversation management actions
    loadModelSettings,
    saveModelSettings,
    setConversationScope,
    switchConversation: conversationHelpers.switchConversation,
    applyConversationData,
    removeConversation: conversationHelpers.removeConversation,
    toggleSidebar,
    setSidebarWidth,
    toggleYoloMode: conversationHelpers.toggleYoloMode,
    toggleThinkMode,
    toggleCodingMode,
    setCodingMode,
    setPlanBinding,
    unbindPlan,
    useAutoPlanBinding,
    startPlanExecution: planExecution.startPlanExecution,
    openCurrentPlan,
    refreshConversationPlans,
    openPlan,
    closePlan,

    // Message actions
    addMessage,
    updateMessage,
    appendToMessage,
    addToolCallToMessage,
    updateToolCallResult,
    appendToolCallOutput,
    appendDelegateDelta,
    setToolCallAwaitingApproval,
    addPendingApproval,
    removePendingApproval,
    clearPendingApprovals,
    clearMessages,
    setLoading,
    setError,
    clearError,
    newConversation: conversationHelpers.newConversation,
    sendMessage,
    removeFromQueue,
    editQueueItem,
    stopGeneration,
    handleToolApproval,
    approveToolExecution,
    rejectToolExecution,
    approveAndWhitelist,
    submitQuestionAnswer,
    loadWhitelistRules,
    removeWhitelistRule,
    retryFromMessage,
    startEditMessage,
    cancelEditMessage,
    saveEditMessage,
    deleteMessagesFrom,
    generateTitle,
    updateTitle,
  }
})
