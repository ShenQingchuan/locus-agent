import type { Message as ApiMessage, Conversation, CoreMessage, LLMProviderType, ToolCall, ToolResult } from '@locus-agent/shared'
import type { PendingApproval } from '@/api/chat'
import { DEFAULT_API_BASES, DEFAULT_MODELS } from '@locus-agent/shared'
import { useToggle } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  abortChat,
  approveToolCall,
  deleteConversation,
  fetchSettingsConfig,
  streamChat,
  truncateMessages,
  updateConversation,
  updateSettingsConfig,
} from '@/api/chat'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'

export interface ToolCallState {
  toolCall: ToolCall
  result?: ToolResult
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval'
  /** 工具执行过程中的流式输出（如 bash 的 stdout/stderr） */
  output?: string
}

export type MessagePart
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }
    | { type: 'tool-call', toolCallIndex: number }

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 助手消息所使用的模型（格式：provider/model） */
  model?: string
  timestamp: number
  toolCalls?: ToolCallState[]
  isStreaming?: boolean
  /** 思考过程内容 */
  reasoning?: string
  /** 有序内容部分，保持文本与工具调用的交错顺序 */
  parts?: MessagePart[]
  /** Token 消耗统计信息 */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export const useChatStore = defineStore('chat', () => {
  // Conversation management
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)

  // Current conversation state
  const messages = ref<Message[]>([])
  const isLoading = ref(false)
  const error = ref<{ code: string, message: string } | null>(null)
  const currentStreamingMessageId = ref<string | null>(null)
  const pendingApprovals = ref<Map<string, PendingApproval>>(new Map())

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

  // Yolo mode state (persisted per conversation)
  const yoloMode = ref(false)

  // Think mode state
  const [thinkMode, toggleThinkMode] = useToggle(true)

  // Model provider & model name (synced with server settings)
  const provider = ref<LLMProviderType>('anthropic')
  const modelName = ref('')
  const isSavingModelSettings = ref(false)

  // Edit message state
  const editingMessageId = ref<string | null>(null)
  const editingContent = ref<string>('')

  const hasError = computed(() => error.value !== null)
  const isStreaming = computed(() => currentStreamingMessageId.value !== null)
  const hasPendingApprovals = computed(() => pendingApprovals.value.size > 0)

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
        if (config.runtime?.contextWindow)
          MAX_CONTEXT_TOKENS.value = config.runtime.contextWindow
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to load model settings:', err)
    }
  }

  async function saveModelSettings(newProvider: LLMProviderType, newModel: string): Promise<{ success: boolean, message?: string }> {
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

      const result = await updateSettingsConfig(payload)

      if (result.success) {
        provider.value = newProvider
        modelName.value = newModel
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

    currentConversationId.value = id
    clearMessages()
    clearError()
  }

  function applyConversationData(data: { conversation: Conversation, messages: ApiMessage[] }) {
    // Restore yolo mode from conversation settings
    yoloMode.value = data.conversation?.confirmMode === false

    // Convert API messages to local Message format
    // We need to merge tool results from tool messages into assistant messages
    const convertedMessages: Message[] = []

    for (let i = 0; i < data.messages.length; i++) {
      const m = data.messages[i]!

      // Skip tool messages - they will be merged into assistant messages
      if (m.role === 'tool')
        continue

      const parts: MessagePart[] = []
      let toolCallStates: ToolCallState[] | undefined

      // If this assistant message has reasoning, add it as the first part
      if (m.role === 'assistant' && m.reasoning) {
        parts.push({ type: 'reasoning', content: m.reasoning })
      }

      // If this is an assistant message with tool calls
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Create tool call states
        toolCallStates = m.toolCalls.map((tc, idx) => {
          parts.push({ type: 'tool-call', toolCallIndex: idx })
          return { toolCall: tc, status: 'completed' as const }
        })

        // Look for the next tool message to get results
        const nextMessage = data.messages[i + 1]
        if (nextMessage && nextMessage.role === 'tool' && nextMessage.toolResults) {
          // Match tool results to tool calls by toolCallId
          for (const toolResult of nextMessage.toolResults) {
            const toolCallIndex = toolCallStates.findIndex(
              tc => tc.toolCall.toolCallId === toolResult.toolCallId,
            )
            const existingTc = toolCallIndex !== -1 ? toolCallStates[toolCallIndex] : undefined
            if (existingTc) {
              toolCallStates[toolCallIndex] = {
                ...existingTc,
                result: toolResult,
                status: toolResult.isError ? 'error' : 'completed',
              }
            }
          }
        }
      }

      if (m.content) {
        parts.push({ type: 'text', content: m.content })
      }

      convertedMessages.push({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        model: m.role === 'assistant' ? (m.model ?? undefined) : undefined,
        reasoning: m.reasoning || undefined,
        usage: m.role === 'assistant' && m.usage
          ? {
              promptTokens: m.usage.promptTokens,
              completionTokens: m.usage.completionTokens,
              totalTokens: m.usage.totalTokens,
            }
          : undefined,
        timestamp: new Date(m.createdAt).getTime(),
        toolCalls: toolCallStates,
        parts: parts.length > 0 ? parts : undefined,
      })
    }

    messages.value = convertedMessages
  }

  async function removeConversation(id: string) {
    const success = await deleteConversation(id)
    if (success) {
      conversations.value = conversations.value.filter(c => c.id !== id)
      if (currentConversationId.value === id) {
        // Switch to first available conversation or start fresh
        const firstConversation = conversations.value[0]
        if (firstConversation) {
          await switchConversation(firstConversation.id)
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

  function addMessage(message: Omit<Message, 'id' | 'timestamp'>) {
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    messages.value.push(newMessage)
    return newMessage.id
  }

  function updateMessage(id: string, updates: Partial<Message>) {
    const index = messages.value.findIndex(m => m.id === id)
    const existing = index !== -1 ? messages.value[index] : undefined
    if (existing) {
      messages.value[index] = { ...existing, ...updates } as Message
    }
  }

  function appendToMessage(id: string, content: string) {
    const index = messages.value.findIndex(m => m.id === id)
    const message = index !== -1 ? messages.value[index] : undefined
    if (!message)
      return

    const parts = [...(message.parts || [])]
    const lastPart = parts[parts.length - 1]

    if (lastPart && lastPart.type === 'text') {
      parts[parts.length - 1] = { type: 'text', content: lastPart.content + content }
    }
    else {
      parts.push({ type: 'text', content })
    }

    messages.value[index] = {
      ...message,
      content: message.content + content,
      parts,
    }
  }

  function appendReasoningToMessage(id: string, content: string) {
    const index = messages.value.findIndex(m => m.id === id)
    const message = index !== -1 ? messages.value[index] : undefined
    if (!message)
      return

    const parts = [...(message.parts || [])]
    const lastPart = parts[parts.length - 1]

    if (lastPart && lastPart.type === 'reasoning') {
      parts[parts.length - 1] = { type: 'reasoning', content: lastPart.content + content }
    }
    else {
      parts.push({ type: 'reasoning', content })
    }

    messages.value[index] = {
      ...message,
      reasoning: (message.reasoning || '') + content,
      parts,
    }
  }

  function addToolCallToMessage(id: string, toolCall: ToolCall) {
    const index = messages.value.findIndex(m => m.id === id)
    const message = index !== -1 ? messages.value[index] : undefined
    if (!message)
      return

    const toolCalls = [...(message.toolCalls || [])]
    const existingIndex = toolCalls.findIndex(
      tc => tc.toolCall.toolCallId === toolCall.toolCallId,
    )
    if (existingIndex >= 0) {
      const existing = toolCalls[existingIndex]
      if (!existing)
        return
      toolCalls[existingIndex] = { ...existing, toolCall }
      messages.value[index] = {
        ...message,
        toolCalls,
      }
      return
    }

    const toolCallIndex = toolCalls.length
    toolCalls.push({ toolCall, status: 'pending' })

    const parts = [...(message.parts || [])]
    parts.push({ type: 'tool-call', toolCallIndex })

    messages.value[index] = {
      ...message,
      toolCalls,
      parts,
    }
  }

  function updateToolCallResult(messageId: string, toolResult: ToolResult) {
    const messageIndex = messages.value.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? messages.value[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolResult.toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          result: toolResult,
          status: toolResult.isError ? 'error' : 'completed',
        }
      })
      if (hasMatch) {
        messages.value[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
    // Clear pending approval
    pendingApprovals.value.delete(toolResult.toolCallId)
  }

  function appendToolCallOutput(toolCallId: string, _stream: 'stdout' | 'stderr', delta: string) {
    // Find the message containing this toolCallId (search from the end for efficiency)
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const message = messages.value[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      const tcIndex = message.toolCalls.findIndex(
        tc => tc.toolCall.toolCallId === toolCallId,
      )
      if (tcIndex === -1)
        continue

      const tc = message.toolCalls[tcIndex]!
      const newToolCalls = [...message.toolCalls]
      newToolCalls[tcIndex] = {
        ...tc,
        output: (tc.output || '') + delta,
      }
      messages.value[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function setToolCallAwaitingApproval(messageId: string, toolCallId: string) {
    const messageIndex = messages.value.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? messages.value[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-approval',
        }
      })
      if (hasMatch) {
        messages.value[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallExecuting(toolCallId: string) {
    for (let i = 0; i < messages.value.length; i++) {
      const message = messages.value[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        if (toolCallState.status !== 'awaiting-approval') {
          return toolCallState
        }
        return { ...toolCallState, status: 'pending' }
      })

      if (hasMatch) {
        messages.value[i] = { ...message, toolCalls: newToolCalls }
        return
      }
    }
  }

  function addPendingApproval(approval: PendingApproval) {
    pendingApprovals.value.set(approval.toolCallId, approval)
  }

  function removePendingApproval(toolCallId: string) {
    pendingApprovals.value.delete(toolCallId)
  }

  function clearPendingApprovals() {
    pendingApprovals.value.clear()
  }

  function clearMessages() {
    messages.value = []
    error.value = null
    currentStreamingMessageId.value = null
    clearPendingApprovals()
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function setError(err: { code: string, message: string } | null) {
    error.value = err
  }

  function clearError() {
    error.value = null
  }

  function newConversation() {
    // 不立即生成 ID，发消息时再创建
    currentConversationId.value = null
    yoloMode.value = false
    clearMessages()
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

  /** Convert store messages to CoreMessage[] for API (shared with edit/retry logic) */
  function messagesToCoreMessages(msgs: Message[]): CoreMessage[] {
    const out: CoreMessage[] = []
    for (const m of msgs) {
      if (m.role === 'user') {
        out.push({ role: 'user', content: m.content })
      }
      else {
        const assistantMsg: CoreMessage = { role: 'assistant', content: m.content }
        if (m.toolCalls && m.toolCalls.length > 0) {
          (assistantMsg as { toolCalls: ToolCall[] }).toolCalls = m.toolCalls.map(tc => tc.toolCall)
          out.push(assistantMsg)
          const toolResults = m.toolCalls
            .filter(tc => tc.result)
            .map(tc => tc.result!)
          if (toolResults.length > 0) {
            out.push({ role: 'tool', content: '', toolResults })
          }
        }
        else {
          out.push(assistantMsg)
        }
      }
    }
    return out
  }

  async function sendMessage(content: string, historyMessages?: CoreMessage[]) {
    if (!content.trim() || isLoading.value)
      return

    clearError()

    // Ensure we have a conversation ID
    if (!currentConversationId.value) {
      currentConversationId.value = crypto.randomUUID()
    }

    // Build history from current messages when not explicitly provided (normal send)
    const historyToSend = historyMessages ?? messagesToCoreMessages(messages.value)

    // Add user message
    addMessage({
      role: 'user',
      content,
    })

    const selectedModel = (modelName.value || DEFAULT_MODELS[provider.value] || 'unknown').trim()
    const assistantModel = `${provider.value}/${selectedModel}`

    // Create assistant message placeholder
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      model: assistantModel,
      isStreaming: true,
    })

    currentStreamingMessageId.value = assistantMessageId
    setLoading(true)

    try {
      await streamChat({
        conversationId: currentConversationId.value,
        message: content,
        messages: historyToSend,
        confirmMode: !yoloMode.value,
        thinkingMode: thinkMode.value,
        onReasoningDelta: (delta) => {
          appendReasoningToMessage(assistantMessageId, delta)
        },
        onTextDelta: (delta) => {
          appendToMessage(assistantMessageId, delta)
        },
        onToolCallStart: (toolCall) => {
          addToolCallToMessage(assistantMessageId, toolCall)
        },
        onToolCallResult: (toolResult) => {
          updateToolCallResult(assistantMessageId, toolResult)
        },
        onToolPendingApproval: (approval) => {
          addPendingApproval(approval)
          setToolCallAwaitingApproval(assistantMessageId, approval.toolCallId)
        },
        onToolOutputDelta: (toolCallId, stream, delta) => {
          appendToolCallOutput(toolCallId, stream, delta)
        },
        onDone: (_messageId, usage, model) => {
          const updates: Partial<Message> = { isStreaming: false }
          if (model) {
            updates.model = model
          }
          if (usage && usage.totalTokens > 0) {
            updates.usage = usage
          }
          updateMessage(assistantMessageId, updates)
          currentStreamingMessageId.value = null
          setLoading(false)
        },
        onError: (code, message) => {
          setError({ code, message })
          updateMessage(assistantMessageId, {
            isStreaming: false,
            content: messages.value.find(m => m.id === assistantMessageId)?.content || '',
          })
          currentStreamingMessageId.value = null
          setLoading(false)
        },
      })

      // 兜底：服务端或网络异常结束但未收到 done/error 时，避免界面长期停留在 loading 态
      if (currentStreamingMessageId.value === assistantMessageId) {
        updateMessage(assistantMessageId, { isStreaming: false })
        currentStreamingMessageId.value = null
        setLoading(false)
      }
    }
    catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError({ code: 'STREAM_ERROR', message: errorMessage })
      updateMessage(assistantMessageId, { isStreaming: false })
      currentStreamingMessageId.value = null
      setLoading(false)
    }
  }

  async function stopGeneration() {
    if (currentStreamingMessageId.value && currentConversationId.value) {
      await abortChat(currentConversationId.value)
      updateMessage(currentStreamingMessageId.value, { isStreaming: false })
      currentStreamingMessageId.value = null
      setLoading(false)
    }
  }

  async function handleToolApproval(toolCallId: string, approved: boolean) {
    if (!currentConversationId.value)
      return false

    // Immediately update UI before awaiting the API call
    removePendingApproval(toolCallId)
    if (approved)
      setToolCallExecuting(toolCallId)

    const switchToYolo = approved && yoloMode.value ? true : undefined
    const success = await approveToolCall(currentConversationId.value, toolCallId, approved, switchToYolo)
    return success
  }

  async function approveToolExecution(toolCallId: string) {
    return handleToolApproval(toolCallId, true)
  }

  async function rejectToolExecution(toolCallId: string) {
    return handleToolApproval(toolCallId, false)
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
  }

  /**
   * 取消编辑消息
   */
  function cancelEditMessage() {
    editingMessageId.value = null
    editingContent.value = ''
  }

  /**
   * 保存编辑后的消息并重新发送
   */
  async function saveEditMessage(messageId: string, newContent: string) {
    const messageIndex = messages.value.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? messages.value[messageIndex] : undefined
    if (!message) {
      console.warn('[saveEditMessage] 未找到消息:', messageId)
      return
    }

    if (message.role !== 'user') {
      console.warn('[saveEditMessage] 只能编辑用户消息')
      return
    }

    // 清除编辑状态
    editingMessageId.value = null
    editingContent.value = ''

    // 如果内容没变，不需要重新发送
    if (newContent.trim() === message.content.trim()) {
      return
    }

    // 保存之前的历史
    const historyBeforeEdit = messages.value.slice(0, messageIndex)

    // 计算后端需要保留的消息数量
    let backendKeepCount = 0
    for (const m of historyBeforeEdit) {
      backendKeepCount++
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.some(tc => tc.result)) {
        backendKeepCount++
      }
    }

    // 通知后端截断消息
    if (currentConversationId.value) {
      await truncateMessages(currentConversationId.value, backendKeepCount)
    }

    // 删除前端的本地消息
    messages.value = historyBeforeEdit

    // 发送编辑后的新内容（带历史）
    await sendMessage(newContent.trim(), messagesToCoreMessages(historyBeforeEdit))
  }

  /**
   * 从指定消息开始重试
   * 删除该消息及之后的所有消息，然后重新发送
   */
  async function retryFromMessage(messageId: string) {
    const messageIndex = messages.value.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? messages.value[messageIndex] : undefined
    if (!message) {
      console.warn('[retryFromMessage] 未找到消息:', messageId)
      return
    }

    if (message.role !== 'user') {
      console.warn('[retryFromMessage] 只能重试用户消息')
      return
    }

    // 保存消息内容和之前的历史
    const content = message.content
    const historyBeforeRetry = messages.value.slice(0, messageIndex)

    // 计算后端需要保留的消息数量
    // 前端跳过了 tool 消息，所以需要根据 assistant 的 toolCalls 推算
    let backendKeepCount = 0
    for (const m of historyBeforeRetry) {
      backendKeepCount++ // 每条前端消息对应至少 1 条后端消息
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.some(tc => tc.result)) {
        backendKeepCount++ // assistant 有 tool results → 后端还有 1 条 tool 消息
      }
    }

    // 通知后端截断消息
    if (currentConversationId.value) {
      await truncateMessages(currentConversationId.value, backendKeepCount)
    }

    // 删除前端的本地消息
    messages.value = historyBeforeRetry

    // 重新发送消息，带上历史
    await sendMessage(content, messagesToCoreMessages(historyBeforeRetry))
  }

  return {
    // Conversation management state
    conversations,
    currentConversationId,
    isSidebarCollapsed,
    sidebarWidth,
    yoloMode,
    thinkMode,
    provider,
    modelName,
    isSavingModelSettings,

    // Current conversation state
    messages,
    isLoading,
    error,
    currentStreamingMessageId,
    pendingApprovals,

    // Edit message state
    editingMessageId,
    editingContent,

    // Computed
    hasError,
    isStreaming,
    hasPendingApprovals,
    currentConversation,
    contextTokensUsed,
    contextUsagePercentage,
    MAX_CONTEXT_TOKENS,

    // Conversation management actions
    loadModelSettings,
    saveModelSettings,
    switchConversation,
    applyConversationData,
    removeConversation,
    toggleSidebar,
    setSidebarWidth,
    toggleYoloMode,
    toggleThinkMode,

    // Message actions
    addMessage,
    updateMessage,
    appendToMessage,
    addToolCallToMessage,
    updateToolCallResult,
    appendToolCallOutput,
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
    stopGeneration,
    handleToolApproval,
    approveToolExecution,
    rejectToolExecution,
    retryFromMessage,
    startEditMessage,
    cancelEditMessage,
    saveEditMessage,
  }
})
