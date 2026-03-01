import type { AddToWhitelistPayload, Message as ApiMessage, Conversation, CoreMessage, CustomProviderMode, DelegateDelta, LLMProviderType, ToolCall, ToolResult, WhitelistRule } from '@locus-agent/shared'
import type { PendingApproval, PendingQuestion, QuestionAnswer } from '@/api/chat'
import { DEFAULT_API_BASES, DEFAULT_MODELS } from '@locus-agent/shared'
import { useToggle } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  abortChat,
  answerQuestion,
  approveToolCall,
  deleteConversation,
  deleteWhitelistRule,
  fetchSettingsConfig,
  fetchWhitelistRules,
  generateConversationTitle,
  streamChat,
  truncateMessages,
  updateConversation,
  updateSettingsConfig,
} from '@/api/chat'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'

export interface ToolCallState {
  toolCall: ToolCall
  result?: ToolResult
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval' | 'awaiting-question' | 'interrupted'
  /** 工具执行过程中的流式输出（如 bash 的 stdout/stderr） */
  output?: string
  /** Delegate tool streaming state updates */
  delegateDeltas?: DelegateDelta[]
}

export type MessagePart
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }
    | { type: 'tool-call', toolCallIndex: number }

export interface QueuedMessage {
  id: string
  content: string
}

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

export interface TodoTask {
  id: string
  content: string
  status: 'in_progress' | 'completed'
}

type ChatError = { code: string, message: string } | null

interface ConversationRuntimeState {
  messages: Message[]
  todoTasks: TodoTask[]
  isLoading: boolean
  error: ChatError
  currentStreamingMessageId: string | null
  pendingApprovals: Map<string, PendingApproval>
  pendingQuestions: Map<string, PendingQuestion>
  messageQueue: QueuedMessage[]
  isProcessingQueue: boolean
}

function createConversationRuntimeState(): ConversationRuntimeState {
  return {
    messages: [],
    todoTasks: [],
    isLoading: false,
    error: null,
    currentStreamingMessageId: null,
    pendingApprovals: new Map(),
    pendingQuestions: new Map(),
    messageQueue: [],
    isProcessingQueue: false,
  }
}

export const useChatStore = defineStore('chat', () => {
  // Conversation management
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)

  // Conversation runtime state (isolated per conversation)
  const conversationRuntimeStates = ref<Record<string, ConversationRuntimeState>>({})
  const draftRuntimeState = ref<ConversationRuntimeState>(createConversationRuntimeState())

  function ensureConversationRuntimeState(conversationId: string): ConversationRuntimeState {
    const existing = conversationRuntimeStates.value[conversationId]
    if (existing)
      return existing

    const created = createConversationRuntimeState()
    conversationRuntimeStates.value[conversationId] = created
    return created
  }

  function getConversationRuntimeState(conversationId: string | null | undefined = currentConversationId.value): ConversationRuntimeState {
    if (!conversationId)
      return draftRuntimeState.value
    return ensureConversationRuntimeState(conversationId)
  }

  function clearConversationRuntimeState(conversationId: string | null | undefined = currentConversationId.value) {
    if (!conversationId) {
      draftRuntimeState.value = createConversationRuntimeState()
      return
    }
    conversationRuntimeStates.value[conversationId] = createConversationRuntimeState()
  }

  function removeConversationRuntimeState(conversationId: string) {
    if (conversationRuntimeStates.value[conversationId]) {
      delete conversationRuntimeStates.value[conversationId]
    }
  }

  // Current conversation runtime state (derived)
  const messages = computed<Message[]>({
    get: () => getConversationRuntimeState().messages,
    set: value => (getConversationRuntimeState().messages = value),
  })
  const todoTasks = computed<TodoTask[]>({
    get: () => getConversationRuntimeState().todoTasks,
    set: value => (getConversationRuntimeState().todoTasks = value),
  })
  const isLoading = computed<boolean>({
    get: () => getConversationRuntimeState().isLoading,
    set: value => (getConversationRuntimeState().isLoading = value),
  })
  const error = computed<ChatError>({
    get: () => getConversationRuntimeState().error,
    set: value => (getConversationRuntimeState().error = value),
  })
  const currentStreamingMessageId = computed<string | null>({
    get: () => getConversationRuntimeState().currentStreamingMessageId,
    set: value => (getConversationRuntimeState().currentStreamingMessageId = value),
  })
  const pendingApprovals = computed<Map<string, PendingApproval>>({
    get: () => getConversationRuntimeState().pendingApprovals,
    set: value => (getConversationRuntimeState().pendingApprovals = value),
  })
  const pendingQuestions = computed<Map<string, PendingQuestion>>({
    get: () => getConversationRuntimeState().pendingQuestions,
    set: value => (getConversationRuntimeState().pendingQuestions = value),
  })

  // Message queue: messages queued while LLM is busy (not yet added to messages list)
  const messageQueue = computed<QueuedMessage[]>({
    get: () => getConversationRuntimeState().messageQueue,
    set: value => (getConversationRuntimeState().messageQueue = value),
  })
  /** Whether the queue processor is currently draining queued messages */
  const isProcessingQueue = computed<boolean>({
    get: () => getConversationRuntimeState().isProcessingQueue,
    set: value => (getConversationRuntimeState().isProcessingQueue = value),
  })

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

  // Yolo mode state (persisted per conversation)
  const yoloMode = ref(false)

  // Think mode state
  const [thinkMode, toggleThinkMode] = useToggle(true)

  // Model provider & model name (synced with server settings)
  const provider = ref<LLMProviderType>('anthropic')
  const modelName = ref('')
  const customMode = ref<CustomProviderMode>('openai-compatible')
  const isSavingModelSettings = ref(false)

  // Edit message state
  const editingMessageId = ref<string | null>(null)
  const editingContent = ref<string>('')

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

    currentConversationId.value = id
    ensureConversationRuntimeState(id)
    clearError(id)
    loadWhitelistRules(id)
  }

  function applyConversationData(
    data: { conversation: Conversation, messages: ApiMessage[] },
    conversationId: string | null = currentConversationId.value,
  ) {
    if (!conversationId)
      return

    // Restore yolo mode from conversation settings
    if (conversationId === currentConversationId.value)
      yoloMode.value = data.conversation?.confirmMode === false

    // Convert API messages to local Message format
    // We need to merge tool results from tool messages into assistant messages
    const convertedMessages: Message[] = []
    let reconstructedTodos: TodoTask[] = []

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
              // For bash tools, restore output from the result so the terminal widget renders
              const output = existingTc.toolCall.toolName === 'bash' && toolResult.result
                ? (typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result))
                : undefined
              toolCallStates[toolCallIndex] = {
                ...existingTc,
                result: toolResult,
                status: toolResult.isError ? 'error' : 'completed',
                output,
              }

              if (!toolResult.isError && existingTc.toolCall.toolName === 'manage_todos') {
                const parsed = parseManageTodosResult(toolResult.result)
                if (parsed)
                  reconstructedTodos = parsed
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

    const runtimeState = getConversationRuntimeState(conversationId)
    runtimeState.messages = convertedMessages
    runtimeState.todoTasks = reconstructedTodos
  }

  function parseManageTodosResult(result: unknown): TodoTask[] | null {
    if (typeof result !== 'string')
      return null

    const lines = result.split('\n')
    const todoLines = lines.filter((line) => {
      const normalized = line.trim()
      return /^\d+\.\s+\[(?:completed|in_progress)\]/.test(normalized) && normalized.includes(') ')
    })
    if (todoLines.length === 0) {
      if (result.includes('Current todos: (empty)'))
        return []
      return null
    }

    const parsed: TodoTask[] = []
    for (const line of todoLines) {
      const normalized = line.trim()
      const status = normalized.includes('[completed]')
        ? 'completed'
        : normalized.includes('[in_progress]')
          ? 'in_progress'
          : null
      if (!status)
        continue

      const idStart = normalized.indexOf('(')
      const idEnd = normalized.indexOf(')', idStart + 1)
      if (idStart === -1 || idEnd === -1 || idEnd <= idStart + 1)
        continue

      const id = normalized.slice(idStart + 1, idEnd).trim()
      const content = normalized.slice(idEnd + 1).trim()
      if (!id || !content)
        continue

      parsed.push({
        id,
        status,
        content,
      })
    }

    return parsed
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

  function addMessage(
    message: Omit<Message, 'id' | 'timestamp'>,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const newMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    runtimeState.messages.push(newMessage)
    return newMessage.id
  }

  function updateMessage(
    id: string,
    updates: Partial<Message>,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const existing = index !== -1 ? runtimeState.messages[index] : undefined
    if (existing) {
      runtimeState.messages[index] = { ...existing, ...updates } as Message
    }
  }

  function appendToMessage(
    id: string,
    content: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
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

    runtimeState.messages[index] = {
      ...message,
      content: message.content + content,
      parts,
    }
  }

  function appendReasoningToMessage(
    id: string,
    content: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
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

    runtimeState.messages[index] = {
      ...message,
      reasoning: (message.reasoning || '') + content,
      parts,
    }
  }

  function addToolCallToMessage(
    id: string,
    toolCall: ToolCall,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
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
      runtimeState.messages[index] = {
        ...message,
        toolCalls,
      }
      return
    }

    const toolCallIndex = toolCalls.length
    toolCalls.push({ toolCall, status: 'pending' })

    const parts = [...(message.parts || [])]
    parts.push({ type: 'tool-call', toolCallIndex })

    runtimeState.messages[index] = {
      ...message,
      toolCalls,
      parts,
    }
  }

  function updateToolCallResult(
    messageId: string,
    toolResult: ToolResult,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolResult.toolCallId) {
          return toolCallState
        }
        hasMatch = true
        // Determine status based on result flags
        let status: ToolCallState['status'] = 'completed'
        if (toolResult.isInterrupted) {
          status = 'interrupted'
        }
        else if (toolResult.isError) {
          status = 'error'
        }
        return {
          ...toolCallState,
          result: toolResult,
          status,
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }

      const matchedToolCall = message.toolCalls.find(tc => tc.toolCall.toolCallId === toolResult.toolCallId)?.toolCall
      if (matchedToolCall && matchedToolCall.toolName === 'manage_todos' && !toolResult.isError) {
        const parsed = parseManageTodosResult(toolResult.result)
        if (parsed)
          runtimeState.todoTasks = parsed
      }
    }
    // Clear pending approval
    runtimeState.pendingApprovals.delete(toolResult.toolCallId)
  }

  function appendToolCallOutput(
    toolCallId: string,
    _stream: 'stdout' | 'stderr',
    delta: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    // Find the message containing this toolCallId (search from the end for efficiency)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
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
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  /**
   * 追加 Delegate 工具的流式状态更新
   */
  function appendDelegateDelta(
    toolCallId: string,
    delta: DelegateDelta,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    // Find the message containing this toolCallId (search from the end for efficiency)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
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
        delegateDeltas: [...(tc.delegateDeltas || []), delta],
      }
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function setToolCallAwaitingApproval(
    messageId: string,
    toolCallId: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
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
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallAwaitingQuestion(
    messageId: string,
    toolCallId: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-question',
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallExecuting(
    toolCallId: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = 0; i < runtimeState.messages.length; i++) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        if (toolCallState.status !== 'awaiting-approval' && toolCallState.status !== 'awaiting-question') {
          return toolCallState
        }
        return { ...toolCallState, status: 'pending' }
      })

      if (hasMatch) {
        runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
        return
      }
    }
  }

  function addPendingApproval(
    approval: PendingApproval,
    conversationId: string | null = currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.set(approval.toolCallId, approval)
  }

  function removePendingApproval(
    toolCallId: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingApprovals.delete(toolCallId)
  }

  function clearPendingApprovals(conversationId: string | null = currentConversationId.value) {
    getConversationRuntimeState(conversationId).pendingApprovals.clear()
  }

  function addPendingQuestion(
    question: PendingQuestion,
    conversationId: string | null = currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.set(question.toolCallId, question)
  }

  function removePendingQuestion(
    toolCallId: string,
    conversationId: string | null = currentConversationId.value,
  ) {
    getConversationRuntimeState(conversationId).pendingQuestions.delete(toolCallId)
  }

  function clearMessages(conversationId: string | null = currentConversationId.value) {
    const runtimeState = getConversationRuntimeState(conversationId)
    runtimeState.messages = []
    runtimeState.todoTasks = []
    runtimeState.messageQueue = []
    runtimeState.error = null
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false
    runtimeState.pendingApprovals.clear()
    runtimeState.pendingQuestions.clear()
    runtimeState.isProcessingQueue = false
  }

  function setLoading(loading: boolean, conversationId: string | null = currentConversationId.value) {
    getConversationRuntimeState(conversationId).isLoading = loading
  }

  function setError(err: ChatError, conversationId: string | null = currentConversationId.value) {
    getConversationRuntimeState(conversationId).error = err
  }

  function clearError(conversationId: string | null = currentConversationId.value) {
    getConversationRuntimeState(conversationId).error = null
  }

  // Incremented when newConversation is called; ChatInput watches this to focus the prompt input
  const focusInputTrigger = ref(0)

  function newConversation() {
    // 不立即生成 ID，发消息时再创建
    currentConversationId.value = null
    yoloMode.value = false
    clearConversationRuntimeState(null)
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
   * 发送消息（或入队）
   * - 如果 LLM 空闲，直接发送
   * - 如果 LLM 正忙（isLoading），将消息放入队列，等待当前请求结束后自动发送
   *
   * historyMessages 仅由 edit/retry 逻辑在空闲时提供，队列模式下不支持。
   */
  async function sendMessage(
    content: string,
    historyMessages?: CoreMessage[],
    targetConversationId?: string,
  ): Promise<string | null> {
    if (!content.trim())
      return null

    let conversationId = targetConversationId ?? currentConversationId.value
    let isNewConversation = false

    // Ensure we have a conversation ID
    if (!conversationId) {
      conversationId = crypto.randomUUID()
      isNewConversation = true
      // Keep current selection in sync for normal user sends.
      if (!targetConversationId) {
        currentConversationId.value = conversationId
      }
      // Optimistically add to conversations list so sidebar shows it immediately
      const now = new Date()
      const optimisticConversation: Conversation = {
        id: conversationId,
        title: content.length > 50 ? `${content.substring(0, 50)}...` : content,
        confirmMode: !yoloMode.value,
        createdAt: now,
        updatedAt: now,
      }
      conversations.value = [optimisticConversation, ...conversations.value]
    }

    const runtimeState = getConversationRuntimeState(conversationId)

    // 如果当前会话正在加载（LLM 忙），把消息加入该会话队列（不添加到消息列表）
    if (runtimeState.isLoading && !historyMessages) {
      const queueItem = { id: crypto.randomUUID(), content }
      runtimeState.messageQueue.push(queueItem)
      return conversationId
    }

    clearError(conversationId)

    // Build history from target conversation when not explicitly provided (normal send)
    const historyToSend = historyMessages ?? messagesToCoreMessages(runtimeState.messages)

    // Add user message
    addMessage({
      role: 'user',
      content,
    }, conversationId)

    const selectedModel = (modelName.value || DEFAULT_MODELS[provider.value] || 'unknown').trim()
    const assistantModel = `${provider.value}/${selectedModel}`

    // Create assistant message placeholder
    const assistantMessageId = addMessage({
      role: 'assistant',
      content: '',
      model: assistantModel,
      isStreaming: true,
    }, conversationId)

    setLoading(true, conversationId)
    getConversationRuntimeState(conversationId).currentStreamingMessageId = assistantMessageId

    try {
      await streamChat({
        conversationId,
        message: content,
        messages: historyToSend,
        confirmMode: !yoloMode.value,
        thinkingMode: thinkMode.value,
        onReasoningDelta: (delta) => {
          appendReasoningToMessage(assistantMessageId, delta, conversationId)
        },
        onTextDelta: (delta) => {
          appendToMessage(assistantMessageId, delta, conversationId)
        },
        onToolCallStart: (toolCall) => {
          addToolCallToMessage(assistantMessageId, toolCall, conversationId)
        },
        onToolCallResult: (toolResult) => {
          updateToolCallResult(assistantMessageId, toolResult, conversationId)
        },
        onToolPendingApproval: (approval) => {
          addPendingApproval(approval, conversationId)
          setToolCallAwaitingApproval(assistantMessageId, approval.toolCallId, conversationId)
        },
        onQuestionPending: (question) => {
          addPendingQuestion(question, conversationId)
          setToolCallAwaitingQuestion(assistantMessageId, question.toolCallId, conversationId)
        },
        onToolOutputDelta: (toolCallId, stream, delta) => {
          appendToolCallOutput(toolCallId, stream, delta, conversationId)
        },
        onDelegateDelta: (event) => {
          appendDelegateDelta(event.toolCallId, event.delta, conversationId)
        },
        onDone: (_messageId, usage, model) => {
          const updates: Partial<Message> = { isStreaming: false }
          if (model) {
            updates.model = model
          }
          if (usage && usage.totalTokens > 0) {
            updates.usage = usage
          }
          updateMessage(assistantMessageId, updates, conversationId)
          const doneState = getConversationRuntimeState(conversationId)
          doneState.currentStreamingMessageId = null
          doneState.isLoading = false

          // Auto-generate title after first Q&A exchange on a new conversation
          if (isNewConversation && conversationId) {
            generateTitle(conversationId)
          }
        },
        onError: (code, message) => {
          setError({ code, message }, conversationId)
          const errorState = getConversationRuntimeState(conversationId)
          updateMessage(assistantMessageId, {
            isStreaming: false,
            content: errorState.messages.find(m => m.id === assistantMessageId)?.content || '',
          }, conversationId)
          errorState.currentStreamingMessageId = null
          errorState.isLoading = false
        },
      })

      // 兜底：服务端或网络异常结束但未收到 done/error 时，避免界面长期停留在 loading 态
      if (getConversationRuntimeState(conversationId).currentStreamingMessageId === assistantMessageId) {
        updateMessage(assistantMessageId, { isStreaming: false }, conversationId)
        const fallbackState = getConversationRuntimeState(conversationId)
        fallbackState.currentStreamingMessageId = null
        fallbackState.isLoading = false
      }
    }
    catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError({ code: 'STREAM_ERROR', message: errorMessage }, conversationId)
      updateMessage(assistantMessageId, { isStreaming: false }, conversationId)
      const catchState = getConversationRuntimeState(conversationId)
      catchState.currentStreamingMessageId = null
      catchState.isLoading = false
    }

    // 当前请求结束后，处理队列中积压的消息
    await processMessageQueue(conversationId)
    return conversationId
  }

  /**
   * 处理消息队列：逐条发送积压的消息
   *
   * 排队消息不在 messages 列表中，由 UI 的队列面板单独展示。
   * 每条消息依次通过 sendMessage 发送，每条拥有独立的用户气泡和 LLM 回复。
   * 注意：sendMessage 内部结束后也会调用 processMessageQueue，
   * 但 isProcessingQueue 守卫可防止递归重入。
   */
  async function processMessageQueue(conversationId: string | null = currentConversationId.value) {
    if (!conversationId)
      return

    const runtimeState = getConversationRuntimeState(conversationId)
    if (runtimeState.isProcessingQueue || runtimeState.isLoading || runtimeState.messageQueue.length === 0)
      return

    runtimeState.isProcessingQueue = true

    try {
      // 逐条取出并发送：每次从队首弹出一条，等待该条完成后再取下一条
      while (runtimeState.messageQueue.length > 0) {
        const next = runtimeState.messageQueue.shift()!
        // sendMessage 结束时会再次调用 processMessageQueue，
        // 但 isProcessingQueue 为 true 会直接 return，不会递归。
        await sendMessage(next.content, undefined, conversationId)
      }
    }
    finally {
      runtimeState.isProcessingQueue = false
    }
  }

  /**
   * 从队列中移除指定 id 的消息
   */
  function removeFromQueue(id: string, conversationId: string | null = currentConversationId.value) {
    const queue = getConversationRuntimeState(conversationId).messageQueue
    const index = queue.findIndex(m => m.id === id)
    if (index !== -1) {
      queue.splice(index, 1)
    }
  }

  /**
   * 编辑队列中指定 id 的消息内容
   */
  function editQueueItem(id: string, newContent: string, conversationId: string | null = currentConversationId.value) {
    const item = getConversationRuntimeState(conversationId).messageQueue.find(m => m.id === id)
    if (item) {
      item.content = newContent
    }
  }

  async function stopGeneration() {
    const conversationId = currentConversationId.value
    if (!conversationId)
      return

    const runtimeState = getConversationRuntimeState(conversationId)
    if (runtimeState.currentStreamingMessageId) {
      await abortChat(conversationId)
      updateMessage(runtimeState.currentStreamingMessageId, { isStreaming: false }, conversationId)
      runtimeState.currentStreamingMessageId = null
      runtimeState.isLoading = false

      // abort 结束后处理积压的队列消息
      // sendMessage 内部的 processMessageQueue 可能因为 abort 时序而跳过
      await processMessageQueue(conversationId)
    }
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
   * @returns 会话 ID，用于调用方标记 dirtyConversations
   */
  async function saveEditMessage(messageId: string, newContent: string): Promise<string | null> {
    const conversationId = currentConversationId.value
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (!message) {
      console.warn('[saveEditMessage] 未找到消息:', messageId)
      return null
    }

    if (message.role !== 'user') {
      console.warn('[saveEditMessage] 只能编辑用户消息')
      return null
    }

    // 清除编辑状态
    editingMessageId.value = null
    editingContent.value = ''

    // 如果内容没变，不需要重新发送
    if (newContent.trim() === message.content.trim()) {
      return null
    }

    // 保存之前的历史
    const historyBeforeEdit = runtimeState.messages.slice(0, messageIndex)

    // 计算后端需要保留的消息数量
    let backendKeepCount = 0
    for (const m of historyBeforeEdit) {
      backendKeepCount++
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.some(tc => tc.result)) {
        backendKeepCount++
      }
    }

    // 通知后端截断消息
    if (conversationId) {
      await truncateMessages(conversationId, backendKeepCount)
    }

    // 删除前端的本地消息
    runtimeState.messages = historyBeforeEdit

    // 发送编辑后的新内容（带历史）
    await sendMessage(newContent.trim(), messagesToCoreMessages(historyBeforeEdit), conversationId ?? undefined)

    return conversationId
  }

  /**
   * 从指定消息开始重试
   * 删除该消息及之后的所有消息，然后重新发送
   * @returns 会话 ID，用于调用方标记 dirtyConversations
   */
  async function retryFromMessage(messageId: string): Promise<string | null> {
    const conversationId = currentConversationId.value
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (!message) {
      console.warn('[retryFromMessage] 未找到消息:', messageId)
      return null
    }

    if (message.role !== 'user') {
      console.warn('[retryFromMessage] 只能重试用户消息')
      return null
    }

    // 保存消息内容和之前的历史
    const content = message.content
    const historyBeforeRetry = runtimeState.messages.slice(0, messageIndex)

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
    if (conversationId) {
      await truncateMessages(conversationId, backendKeepCount)
    }

    // 删除前端的本地消息
    runtimeState.messages = historyBeforeRetry

    // 重新发送消息，带上历史
    await sendMessage(content, messagesToCoreMessages(historyBeforeRetry), conversationId ?? undefined)

    return conversationId
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
    customMode,
    isSavingModelSettings,

    // Current conversation state
    messages,
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
