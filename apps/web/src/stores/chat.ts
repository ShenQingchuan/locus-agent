import type { AddToWhitelistPayload, Conversation, CoreMessage, CustomProviderMode, LLMProviderType, MessageImageAttachment, PlanBinding, WhitelistRule } from '@univedge/locus-agent-sdk'
import type { QuestionAnswer } from '@/api/chat'
import { DEFAULT_API_BASES, DEFAULT_MODELS, getCodingProviderForParent } from '@univedge/locus-agent-sdk'
import { useToggle } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { answerQuestion, approveToolCall, fetchConversationPlans } from '@/api/chat'
import { deleteConversation, generateConversationTitle, updateConversation } from '@/api/conversations'
import { fetchSettingsConfig, updateSettingsConfig } from '@/api/settings'
import { deleteWhitelistRule, fetchWhitelistRules } from '@/api/whitelist'
import { createAssistantRuntimeManager } from '@/composables/useAssistantRuntime'
import { createConversationMessagingActions } from '@/composables/useConversationMessaging'
import { createConversationScopeState } from '@/composables/useConversationScopeState'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'

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

  // Whitelist state
  const whitelistRules = ref<WhitelistRule[]>([])

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

  // Think mode state
  const [thinkMode, toggleThinkMode] = useToggle(true)

  // Coding mode: build (直接编码) / plan (先规划再编码) — 仅 Coding 空间可用
  const codingMode = ref<'build' | 'plan'>('build')
  const currentPlan = ref<{ filename: string, content: string } | null>(null)
  const isLoadingPlan = ref(false)
  const planBindings = ref<Record<string, { mode: 'auto' | 'none' }>>({})
  const latestPlanByConversation = ref<Record<string, { filename: string, content: string }>>({})
  // Plan viewer state — Coding 页面中间面板展示实现计划
  const viewingPlan = ref<{ filename: string, content: string } | null>(null)
  function openPlan(filename: string, content: string) {
    viewingPlan.value = { filename, content }
  }
  function closePlan() {
    viewingPlan.value = null
  }

  function getPlanBindingForConversation(conversationId?: string | null): { mode: 'auto' | 'none' } {
    if (!conversationId)
      return { mode: 'auto' }
    return planBindings.value[conversationId] ?? { mode: 'auto' }
  }

  function setPlanBinding(mode: 'auto' | 'none') {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return
    planBindings.value[conversationId] = { mode }
  }

  function unbindPlan() {
    setPlanBinding('none')
  }

  function useAutoPlanBinding() {
    setPlanBinding('auto')
  }

  async function refreshConversationPlans(conversationId?: string | null) {
    const targetConversationId = conversationId ?? currentConversationId.value
    if (!targetConversationId) {
      currentPlan.value = null
      return
    }

    isLoadingPlan.value = true
    try {
      const payload = await fetchConversationPlans(targetConversationId)
      if (!payload) {
        currentPlan.value = null
        return
      }
      currentPlan.value = payload.currentPlan
    }
    finally {
      isLoadingPlan.value = false
    }
  }

  const currentPlanBinding = computed(() => getPlanBindingForConversation(currentConversationId.value))
  const activeBoundPlanFilename = computed(() => (currentPlanBinding.value.mode === 'none' ? null : currentPlan.value?.filename ?? null))

  function getPlanBindingPayload(conversationId: string): PlanBinding | undefined {
    const state = getPlanBindingForConversation(conversationId)
    if (state.mode === 'none')
      return { mode: 'none' }
    return { mode: 'auto' }
  }

  function openCurrentPlan(): boolean {
    if (currentPlanBinding.value.mode === 'none')
      return false
    if (!currentPlan.value)
      return false
    openPlan(currentPlan.value.filename, currentPlan.value.content)
    return true
  }

  function onWritePlanDetected(conversationId: string, filename: string, content: string) {
    const snapshot = { filename, content }
    latestPlanByConversation.value[conversationId] = snapshot
    if (conversationId === currentConversationId.value) {
      currentPlan.value = snapshot
      openPlan(filename, content)
    }
  }

  const planGeneratingPlaceholder = '计划生成中 ...'
  function onPlanPreviewStart(conversationId: string) {
    if (conversationId !== currentConversationId.value)
      return
    openPlan(planGeneratingPlaceholder, '')
  }

  function onPlanPreviewDelta(conversationId: string, delta: string) {
    if (conversationId !== currentConversationId.value)
      return
    const existing = viewingPlan.value
    if (!existing || existing.filename !== planGeneratingPlaceholder) {
      openPlan(planGeneratingPlaceholder, delta)
      return
    }
    viewingPlan.value = {
      ...existing,
      content: `${existing.content}${delta}`,
    }
  }

  function onPlanPreviewDone(_conversationId: string) {
    // Keep preview open. If write_plan succeeds, onWritePlanDetected will replace it
    // with the persisted plan filename/content.
  }

  function toggleCodingMode() {
    codingMode.value = codingMode.value === 'build' ? 'plan' : 'build'
  }
  function setCodingMode(mode: 'build' | 'plan') {
    codingMode.value = mode
  }

  // Model provider & model name (synced with server settings)
  const provider = ref<LLMProviderType>('anthropic')
  const modelName = ref('')
  const customMode = ref<CustomProviderMode>('openai-compatible')
  const isSavingModelSettings = ref(false)

  // Coding provider selection (kimi-code / null = use default model)
  const codingProvider = ref<'kimi-code' | null>(null)

  // Clear coding provider when switching to a provider that doesn't have one
  watch(provider, (newProvider) => {
    if (codingProvider.value && !getCodingProviderForParent(newProvider)) {
      codingProvider.value = null
    }
  })

  // Auto-enable coding provider when entering coding space; clear when leaving
  watch(conversationScope, (scope) => {
    if (scope.space === 'coding') {
      const meta = getCodingProviderForParent(provider.value)
      if (meta && !codingProvider.value)
        codingProvider.value = meta.value
    }
    else {
      codingProvider.value = null
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

  // 模型上下文窗口配置（动态从 API 获取，默认：128K）
  const MAX_CONTEXT_TOKENS = ref(128_000)

  const BASE_CONTEXT_OVERHEAD_TOKENS = 250
  const MESSAGE_OVERHEAD_TOKENS = 6
  const TOOL_CALL_OVERHEAD_TOKENS = 20
  const TOOL_RESULT_OVERHEAD_TOKENS = 12

  const activeTokenizerModel = computed(() => {
    const selectedModel = (modelName.value || DEFAULT_MODELS[provider.value] || '').trim()
    return selectedModel || undefined
  })

  function estimateTextTokens(text: string): number {
    return countTextTokens(text, activeTokenizerModel.value)
  }

  function estimateUnknownTokens(value: unknown): number {
    return countUnknownTokens(value, activeTokenizerModel.value)
  }

  function estimateCoreMessageTokens(message: CoreMessage): number {
    switch (message.role) {
      case 'user':
      case 'system':
        return MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)
      case 'assistant': {
        let total = MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            total += TOOL_CALL_OVERHEAD_TOKENS
            total += estimateTextTokens(toolCall.toolCallId)
            total += estimateTextTokens(toolCall.toolName)
            total += estimateUnknownTokens(toolCall.args)
          }
        }
        return total
      }
      case 'tool': {
        let total = MESSAGE_OVERHEAD_TOKENS
        for (const toolResult of message.toolResults) {
          total += TOOL_RESULT_OVERHEAD_TOKENS
          total += estimateTextTokens(toolResult.toolCallId)
          total += estimateTextTokens(toolResult.toolName)
          total += estimateUnknownTokens(toolResult.result)
        }
        return total
      }
    }
  }

  // 计算当前会话中使用的总 token 数
  const contextTokensUsed = computed(() => {
    const history = messagesToCoreMessages(messages.value)
    if (history.length === 0)
      return 0

    let total = BASE_CONTEXT_OVERHEAD_TOKENS
    for (const message of history) {
      total += estimateCoreMessageTokens(message)
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

  async function loadModelSettings() {
    try {
      const config = await fetchSettingsConfig()
      if (config) {
        provider.value = config.provider
        modelName.value = config.model ?? ''
        customMode.value = config.customMode ?? 'openai-compatible'
        if (config.runtime?.contextWindow)
          MAX_CONTEXT_TOKENS.value = config.runtime.contextWindow
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to load model settings:', err)
    }
  }

  async function saveModelSettings(
    newProvider: LLMProviderType,
    newModel: string,
    newCustomMode?: CustomProviderMode,
  ): Promise<{ success: boolean, message?: string }> {
    if (isSavingModelSettings.value)
      return { success: false, message: '正在保存中' }
    isSavingModelSettings.value = true
    try {
      const providerChanged = newProvider !== provider.value
      const payload: Parameters<typeof updateSettingsConfig>[0] = {
        provider: newProvider,
        model: newModel,
      }

      if (providerChanged) {
        payload.apiBase = DEFAULT_API_BASES[newProvider] ?? ''
      }

      // 自定义提供商时保存兼容模式
      if (newProvider === 'custom' && newCustomMode) {
        payload.customMode = newCustomMode
      }

      const result = await updateSettingsConfig(payload)

      if (result.success) {
        provider.value = newProvider
        modelName.value = newModel
        if (newCustomMode)
          customMode.value = newCustomMode
        if (result.config?.customMode)
          customMode.value = result.config.customMode
        if (result.config?.runtime?.contextWindow)
          MAX_CONTEXT_TOKENS.value = result.config.runtime.contextWindow
        return { success: true }
      }
      return { success: false, message: result.message }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      return { success: false, message: msg }
    }
    finally {
      isSavingModelSettings.value = false
    }
  }

  // Conversation management actions
  function switchConversation(id: string) {
    if (id === currentConversationId.value)
      return

    cancelEditMessage()
    currentConversationId.value = id
    getConversationRuntimeState(id)
    clearError(id)
    loadWhitelistRules(id)
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
    yoloMode.value = !yoloMode.value
    // Persist to DB if we have a conversation
    if (currentConversationId.value) {
      await updateConversation(currentConversationId.value, {
        confirmMode: !yoloMode.value,
      })
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
    currentConversationId,
    conversationScope,
    yoloMode,
    thinkMode,
    codingMode,
    codingProvider,
    provider,
    modelName,
    conversations,
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
    generateTitle,
    onWritePlanDetected,
    onPlanPreviewStart,
    onPlanPreviewDelta,
    onPlanPreviewDone,
    getPlanBinding: getPlanBindingPayload,
  })

  const {
    sendMessage,
    removeFromQueue,
    editQueueItem,
    stopGeneration,
    saveEditMessage: saveEditedMessage,
    retryFromMessage,
  } = messaging

  function startPlanExecution(filename: string, content: string) {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return

    const snapshot = { filename, content }
    latestPlanByConversation.value[conversationId] = snapshot
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
      await loadWhitelistRules()
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

  /**
   * 加载白名单规则
   */
  async function loadWhitelistRules(conversationId: string | null = currentConversationId.value) {
    const rules = await fetchWhitelistRules(conversationId || undefined)
    if (conversationId === currentConversationId.value) {
      whitelistRules.value = rules
    }
  }

  /**
   * 删除白名单规则
   */
  async function removeWhitelistRule(ruleId: string) {
    const success = await deleteWhitelistRule(ruleId)
    if (success) {
      whitelistRules.value = whitelistRules.value.filter(r => r.id !== ruleId)
    }
    return success
  }

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
    codingProvider,

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
    generateTitle,
    updateTitle,
  }
})
