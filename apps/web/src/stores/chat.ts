import type { AddToWhitelistPayload, Conversation, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { QuestionAnswer } from '@/api/chat'
import type { Message as RuntimeMessage } from '@/composables/useAssistantRuntime'
import { getCodingProviderForParent } from '@univedge/locus-agent-sdk'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { answerQuestion, approveToolCall } from '@/api/chat'
import { deleteConversation, generateConversationTitle, updateConversation } from '@/api/conversations'
import { createAssistantRuntimeManager } from '@/composables/useAssistantRuntime'
import { createConversationMessagingActions } from '@/composables/useConversationMessaging'
import { createConversationScopeState } from '@/composables/useConversationScopeState'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { usePlanStore } from '@/stores/plan'
import { useWhitelistStore } from '@/stores/whitelist'

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

  // Whitelist state (delegated to useWhitelistStore)
  const whitelistStore = useWhitelistStore()

  // Sidebar state
  const STORAGE_KEY_SIDEBAR_WIDTH = 'locus-agent:sidebar-width'

  // Load sidebar width from localStorage
  const getStoredSidebarWidth = (): number => {
    if (typeof window === 'undefined')
      return 220

    try {
      const stored = localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH)
      if (stored) {
        const width = Number.parseInt(stored, 10)
        if (!Number.isNaN(width) && width >= 180 && width <= 400)
          return width
      }
    }
    catch (error) {
      console.warn('[chat store] Failed to load sidebar width from localStorage:', error)
    }
    return 220
  }

  const isSidebarCollapsed = ref(false)
  const sidebarWidth = ref(getStoredSidebarWidth())

  // Delegated stores
  const modelSettingsStore = useModelSettingsStore()
  const planStore = usePlanStore()

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

  const {
    codingMode,
    currentPlan,
    isLoadingPlan,
    viewingPlan,
  } = storeToRefs(planStore)
  const {
    openPlan,
    closePlan,
    toggleCodingMode,
    setCodingMode,
    getPlanBindingPayload,
  } = planStore

  // Bridge plan methods that need currentConversationId
  const currentPlanBinding = computed(() => planStore.getPlanBindingForConversation(currentConversationId.value))
  const activeBoundPlanFilename = computed(() => (currentPlanBinding.value.mode === 'none' ? null : currentPlan.value?.filename ?? null))

  function setPlanBinding(mode: 'auto' | 'none') {
    planStore.setPlanBinding(mode, currentConversationId.value)
  }
  function unbindPlan() {
    planStore.unbindPlan(currentConversationId.value)
  }
  function useAutoPlanBinding() {
    planStore.useAutoPlanBinding(currentConversationId.value)
  }
  function refreshConversationPlans(conversationId?: string | null) {
    return planStore.refreshConversationPlans(conversationId ?? currentConversationId.value)
  }
  function openCurrentPlan(): boolean {
    return planStore.openCurrentPlan(currentConversationId.value)
  }
  function onWritePlanDetected(conversationId: string, filename: string, content: string) {
    planStore.onWritePlanDetected(conversationId, currentConversationId.value, filename, content)
  }
  function onPlanPreviewStart(conversationId: string) {
    planStore.onPlanPreviewStart(conversationId, currentConversationId.value)
  }
  function onPlanPreviewDelta(conversationId: string, delta: string) {
    planStore.onPlanPreviewDelta(conversationId, currentConversationId.value, delta)
  }
  function onPlanPreviewDone(conversationId: string) {
    planStore.onPlanPreviewDone(conversationId, currentConversationId.value)
  }

  // Auto-enable the provider-affine coding executor when entering coding space;
  // clear all coding executors when leaving.
  watch(conversationScope, (scope) => {
    if (scope.space === 'coding') {
      const meta = getCodingProviderForParent(provider.value)
      if (meta && !codingExecutor.value)
        codingExecutor.value = meta.value
    }
    else {
      codingExecutor.value = null
    }
  })

  // Edit message state
  const editingMessageId = ref<string | null>(null)
  const editingContent = ref<string>('')
  const editingAttachments = ref<MessageImageAttachment[]>([])

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

  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value),
  )

  // 计算当前会话中使用的总 token 数（增量缓存优化）
  const BASE_CONTEXT_OVERHEAD_TOKENS = 250
  const _tokenCache = new Map<string, { ref: RuntimeMessage, tokens: number }>()
  const contextTokensUsed = computed(() => {
    const msgs = messages.value
    if (msgs.length === 0) {
      _tokenCache.clear()
      return 0
    }

    // Build set of current message IDs for cache eviction
    const currentIds = new Set<string>()
    let total = BASE_CONTEXT_OVERHEAD_TOKENS

    for (const msg of msgs) {
      currentIds.add(msg.id)
      const cached = _tokenCache.get(msg.id)

      // Cache hit: same object reference means content hasn't changed
      if (cached && cached.ref === msg) {
        total += cached.tokens
        continue
      }

      // Cache miss: convert this single message and estimate tokens
      const coreMessages = messagesToCoreMessages([msg])
      let msgTokens = 0
      for (const cm of coreMessages) {
        msgTokens += estimateCoreMessageTokens(cm)
      }
      _tokenCache.set(msg.id, { ref: msg, tokens: msgTokens })
      total += msgTokens
    }

    // Evict stale entries (deleted messages)
    if (_tokenCache.size > currentIds.size) {
      for (const key of _tokenCache.keys()) {
        if (!currentIds.has(key))
          _tokenCache.delete(key)
      }
    }

    return total
  })

  // 计算上下文使用百分比
  const contextUsagePercentage = computed(() => {
    const total = MAX_CONTEXT_TOKENS.value
    if (total <= 0)
      return 0
    return Math.min(100, (contextTokensUsed.value / total) * 100)
  })

  // Conversation management actions
  function switchConversation(id: string) {
    if (id === currentConversationId.value)
      return

    cancelEditMessage()
    currentConversationId.value = id
    getConversationRuntimeState(id)
    clearError(id)
    whitelistStore.loadWhitelistRules(id)
    void refreshConversationPlans(id)
  }

  async function removeConversation(id: string) {
    const success = await deleteConversation(id)
    if (success) {
      removeConversationRuntimeState(id)
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentConversationId.value === id) {
        // Switch to first available conversation or start fresh
        const firstConversation = conversations.value[0]
        if (firstConversation) {
          switchConversation(firstConversation.id)
        }
        else {
          // 不自动创建，只清空当前状态，发消息时再创建
          newConversation()
        }
      }
    }
    return success
  }

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
  }

  function setSidebarWidth(width: number) {
    const minWidth = 180
    const maxWidth = 400
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width))
    sidebarWidth.value = clampedWidth

    // Save to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, String(clampedWidth))
      }
      catch (error) {
        console.warn('[chat store] Failed to save sidebar width to localStorage:', error)
      }
    }
  }

  // Incremented when newConversation is called; ChatInput watches this to focus the prompt input
  const focusInputTrigger = ref(0)

  function newConversation() {
    // 不立即生成 ID，发消息时再创建
    cancelEditMessage()
    currentConversationId.value = null
    yoloMode.value = false
    clearConversationRuntimeState(null)
    currentPlan.value = null
    focusInputTrigger.value++
  }

  async function toggleYoloMode() {
    const previousYoloMode = yoloMode.value
    const nextYoloMode = !previousYoloMode
    const conversationId = currentConversationId.value

    yoloMode.value = nextYoloMode

    // Persist to DB if we have a conversation.
    // When switching to YOLO during an active approval pause, also sync the
    // current UI state so pending tools immediately resume visually.
    if (!conversationId)
      return

    const pendingToolCallIds = nextYoloMode
      ? [...pendingApprovals.value.keys()]
      : []

    const updated = await updateConversation(conversationId, {
      confirmMode: !nextYoloMode,
    })

    if (!updated) {
      yoloMode.value = previousYoloMode
      return
    }

    const conversationIndex = conversations.value.findIndex(c => c.id === conversationId)
    if (conversationIndex !== -1) {
      conversations.value[conversationIndex] = updated
    }

    if (nextYoloMode && pendingToolCallIds.length > 0) {
      for (const toolCallId of pendingToolCallIds) {
        setToolCallExecuting(toolCallId, conversationId)
      }
      clearPendingApprovals(conversationId)
    }
  }

  /**
   * Generate a title for a conversation using LLM, then update local state
   */
  async function generateTitle(conversationId: string) {
    try {
      const title = await generateConversationTitle(conversationId)
      if (title) {
        // Update the conversation in local state
        const idx = conversations.value.findIndex(c => c.id === conversationId)
        if (idx !== -1) {
          conversations.value[idx] = { ...conversations.value[idx]!, title }
        }
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to generate title:', err)
    }
  }

  /**
   * Update conversation title manually
   */
  async function updateTitle(conversationId: string, title: string) {
    try {
      const updated = await updateConversation(conversationId, { title })
      if (updated) {
        // Update the conversation in local state
        const idx = conversations.value.findIndex(c => c.id === conversationId)
        if (idx !== -1) {
          conversations.value[idx] = { ...conversations.value[idx]!, title: updated.title }
        }
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to update title:', err)
    }
  }

  /**
   * 计划退出时切换到 Build 模式
   */
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
      generateTitle,
      onWritePlanDetected,
      onPlanPreviewStart,
      onPlanPreviewDelta,
      onPlanPreviewDone,
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

  function startPlanExecution(filename: string, content: string) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return

    const snapshot = { filename, content }
    planStore.latestPlanByConversation[conversationId] = snapshot
    currentPlan.value = snapshot

    useAutoPlanBinding()
    setCodingMode('build')

    void sendMessage(
      '开始执行当前已绑定计划。请先 read_plan，再按计划顺序实施，并使用 manage_todos 跟踪进度。',
      undefined,
      conversationId,
      { metadata: { trigger: 'start_plan_execution' } },
    )
  }

  async function handleToolApproval(toolCallId: string, approved: boolean) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return false

    // Immediately update UI before awaiting the API call
    removePendingApproval(toolCallId, conversationId)
    if (approved)
      setToolCallExecuting(toolCallId, conversationId)

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

  /**
   * 批准工具执行并同时加入白名单
   */
  async function approveAndWhitelist(toolCallId: string, payload: AddToWhitelistPayload) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return false

    // 立即更新 UI
    removePendingApproval(toolCallId, conversationId)
    setToolCallExecuting(toolCallId, conversationId)

    const success = await approveToolCall(
      conversationId,
      toolCallId,
      true,
      undefined,
      payload,
    )

    // 成功后刷新白名单列表
    if (success) {
      await whitelistStore.loadWhitelistRules(conversationId)
    }
    return success
  }

  /**
   * 提交提问回答
   */
  async function submitQuestionAnswer(toolCallId: string, answers: QuestionAnswer[]) {
    const conversationId = currentConversationId.value
    // 移除待回答状态
    removePendingQuestion(toolCallId, conversationId)

    // 将工具状态切换为 pending（等待服务端处理结果）
    setToolCallExecuting(toolCallId, conversationId)

    const success = await answerQuestion(toolCallId, answers)
    return success
  }

  // Whitelist actions delegated to useWhitelistStore
  const { whitelistRules, loadWhitelistRules, removeWhitelistRule } = whitelistStore

  /**
   * 开始编辑消息
   */
  function startEditMessage(messageId: string) {
    const message = messages.value.find(m => m.id === messageId)
    if (!message || message.role !== 'user') {
      console.warn('[startEditMessage] 只能编辑用户消息')
      return
    }
    editingMessageId.value = messageId
    editingContent.value = message.content
    editingAttachments.value = [...(message.attachments ?? [])]
  }

  /**
   * 取消编辑消息
   */
  function cancelEditMessage() {
    editingMessageId.value = null
    editingContent.value = ''
    editingAttachments.value = []
  }

  /**
   * 保存编辑后的消息并重新发送
   * @returns 会话 ID，用于调用方标记 dirtyConversations
   */
  async function saveEditMessage(messageId: string, newContent: string, newAttachments: MessageImageAttachment[]): Promise<string | null> {
    // 清除编辑状态
    editingMessageId.value = null
    editingContent.value = ''
    editingAttachments.value = []
    return saveEditedMessage(messageId, newContent, newAttachments)
  }

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

    // Focus input trigger (incremented on newConversation; ChatInput watches to focus)
    focusInputTrigger,

    // Computed
    hasError,
    isStreaming,
    hasPendingApprovals,
    queuedMessageCount,
    completedTodoCount,
    inProgressTodoCount,
    currentConversation,
    contextTokensUsed,
    contextUsagePercentage,
    MAX_CONTEXT_TOKENS,

    // Conversation management actions
    loadModelSettings,
    saveModelSettings,
    setConversationScope,
    switchConversation,
    applyConversationData,
    removeConversation,
    toggleSidebar,
    setSidebarWidth,
    toggleYoloMode,
    toggleThinkMode,
    toggleCodingMode,
    setCodingMode,
    setPlanBinding,
    unbindPlan,
    useAutoPlanBinding,
    startPlanExecution,
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
    newConversation,
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
