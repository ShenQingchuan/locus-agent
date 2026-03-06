import type { Conversation, CoreMessage, LLMProviderType, MessageMetadata, PlanBinding } from '@locus-agent/shared'
import type { Ref } from 'vue'
import type { Message } from '@/composables/useAssistantRuntime'
import type { ConversationScope } from '@/composables/useConversationScopeState'
import { DEFAULT_MODELS } from '@locus-agent/shared'
import { abortChat } from '@/api/chat'
import { truncateMessages } from '@/api/conversations'
import { streamAssistantReply } from '@/composables/useAssistantStreaming'

interface RuntimeState {
  messages: Message[]
  isLoading: boolean
  currentStreamingMessageId: string | null
  messageQueue: Array<{ id: string, content: string }>
  isProcessingQueue: boolean
}

export interface SendMessageOptions {
  /** 附加到用户消息的元数据 — 含 trigger 字段时消息不在 UI 渲染 */
  metadata?: MessageMetadata
}

interface CreateConversationMessagingOptions {
  currentConversationId: Ref<string | null>
  conversationScope: Ref<ConversationScope>
  yoloMode: Ref<boolean>
  thinkMode: Ref<boolean>
  codingMode: Ref<'build' | 'plan'>
  codingProvider: Ref<'kimi-code' | null>
  provider: Ref<LLMProviderType>
  modelName: Ref<string>
  conversations: Ref<Conversation[]>
  getConversationRuntimeState: (conversationId?: string | null) => RuntimeState
  messagesToCoreMessages: (messages: Message[]) => CoreMessage[]
  clearError: (conversationId?: string | null) => void
  setError: (error: { code: string, message: string } | null, conversationId?: string | null) => void
  setLoading: (loading: boolean, conversationId?: string | null) => void
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>, conversationId?: string | null) => string
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string | null) => void
  appendReasoningToMessage: (id: string, content: string, conversationId?: string | null) => void
  appendToMessage: (id: string, content: string, conversationId?: string | null) => void
  addToolCallToMessage: (id: string, toolCall: Parameters<Parameters<typeof streamAssistantReply>[0]['onToolCallStart']>[0], conversationId?: string | null) => void
  updateToolCallResult: (id: string, toolResult: Parameters<Parameters<typeof streamAssistantReply>[0]['onToolCallResult']>[0], conversationId?: string | null) => void
  addPendingApproval: (approval: Parameters<Parameters<typeof streamAssistantReply>[0]['onToolPendingApproval']>[0], conversationId?: string | null) => void
  setToolCallAwaitingApproval: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  addPendingQuestion: (question: Parameters<Parameters<typeof streamAssistantReply>[0]['onQuestionPending']>[0], conversationId?: string | null) => void
  setToolCallAwaitingQuestion: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  appendToolCallOutput: (toolCallId: string, delta: string, conversationId?: string | null) => void
  appendDelegateDelta: (toolCallId: string, delta: Parameters<Parameters<typeof streamAssistantReply>[0]['onDelegateDelta']>[0]['delta'], conversationId?: string | null) => void
  generateTitle: (conversationId: string) => Promise<void>
  onWritePlanDetected?: (conversationId: string, filename: string, content: string) => void
  getPlanBinding?: (conversationId: string) => PlanBinding | undefined
  onPlanPreviewStart?: (conversationId: string) => void
  onPlanPreviewDelta?: (conversationId: string, delta: string) => void
  onPlanPreviewDone?: (conversationId: string) => void
}

function computeBackendKeepCount(history: Message[]): number {
  let backendKeepCount = 0
  for (const m of history) {
    backendKeepCount++
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.some(tc => tc.result)) {
      backendKeepCount++
    }
  }
  return backendKeepCount
}

export function createConversationMessagingActions(options: CreateConversationMessagingOptions) {
  async function sendMessage(
    content: string,
    historyMessages?: CoreMessage[],
    targetConversationId?: string,
    optionsOverride?: SendMessageOptions,
  ): Promise<string | null> {
    if (!content.trim())
      return null

    let conversationId = targetConversationId ?? options.currentConversationId.value
    let isNewConversation = false

    if (!conversationId) {
      conversationId = crypto.randomUUID()
      isNewConversation = true
      if (!targetConversationId) {
        options.currentConversationId.value = conversationId
      }

      const now = new Date()
      const optimisticConversation: Conversation = {
        id: conversationId,
        title: content.length > 50 ? `${content.substring(0, 50)}...` : content,
        space: options.conversationScope.value.space,
        projectKey: options.conversationScope.value.projectKey ?? null,
        confirmMode: !options.yoloMode.value,
        createdAt: now,
        updatedAt: now,
      }
      options.conversations.value = [optimisticConversation, ...options.conversations.value]
    }

    const runtimeState = options.getConversationRuntimeState(conversationId)
    if (runtimeState.isLoading && !historyMessages) {
      runtimeState.messageQueue.push({ id: crypto.randomUUID(), content })
      return conversationId
    }

    options.clearError(conversationId)

    // 后端从 DB 加载历史，正常发送时不需要传 messages
    // 仅 edit/retry 场景会传入 historyMessages（用于 truncate 后的状态同步）
    const historyToSend = historyMessages

    options.addMessage({ role: 'user', content, metadata: optionsOverride?.metadata }, conversationId)

    const selectedModel = (options.modelName.value || DEFAULT_MODELS[options.provider.value] || 'unknown').trim()
    const assistantModel = `${options.provider.value}/${selectedModel}`
    const isPlanningTurn = options.conversationScope.value.space === 'coding' && options.codingMode.value === 'plan'

    if (isPlanningTurn)
      options.onPlanPreviewStart?.(conversationId)

    const assistantMessageId = options.addMessage({
      role: 'assistant',
      content: '',
      model: assistantModel,
      isStreaming: true,
    }, conversationId)

    options.setLoading(true, conversationId)
    options.getConversationRuntimeState(conversationId).currentStreamingMessageId = assistantMessageId

    await streamAssistantReply({
      conversationId,
      assistantMessageId,
      message: content,
      messages: historyToSend,
      scope: options.conversationScope.value,
      confirmMode: !options.yoloMode.value,
      thinkingMode: options.thinkMode.value,
      codingMode: options.conversationScope.value.space === 'coding' ? options.codingMode.value : undefined,
      codingProvider: options.codingProvider.value || undefined,
      planBinding: options.conversationScope.value.space === 'coding' && options.codingMode.value === 'build'
        ? options.getPlanBinding?.(conversationId)
        : undefined,
      messageMetadata: optionsOverride?.metadata,
      onReasoningDelta: (delta) => {
        options.appendReasoningToMessage(assistantMessageId, delta, conversationId)
      },
      onTextDelta: (delta) => {
        if (!isPlanningTurn) {
          options.appendToMessage(assistantMessageId, delta, conversationId)
        }
        // Plan 模式：丢弃 text delta（含 provider 会话废话），
        // 计划内容统一由 onWritePlanDetected 从 write_plan tool args 获取
      },
      onToolCallStart: (toolCall) => {
        options.addToolCallToMessage(assistantMessageId, toolCall, conversationId)

        if (conversationId && toolCall.toolName === 'write_plan') {
          const filename = typeof toolCall.args?.filename === 'string' ? toolCall.args.filename.trim() : ''
          const content = typeof toolCall.args?.content === 'string' ? toolCall.args.content : ''
          if (filename && content) {
            options.onWritePlanDetected?.(conversationId, filename, content)
          }
        }
      },
      onToolCallResult: (toolResult) => {
        options.updateToolCallResult(assistantMessageId, toolResult, conversationId)
      },
      onToolPendingApproval: (approval) => {
        options.addPendingApproval(approval, conversationId)
        options.setToolCallAwaitingApproval(assistantMessageId, approval.toolCallId, conversationId)
      },
      onQuestionPending: (question) => {
        options.addPendingQuestion(question, conversationId)
        options.setToolCallAwaitingQuestion(assistantMessageId, question.toolCallId, conversationId)
      },
      onToolOutputDelta: (toolCallId, stream, delta) => {
        void stream
        options.appendToolCallOutput(toolCallId, delta, conversationId)
      },
      onDelegateDelta: (event) => {
        options.appendDelegateDelta(event.toolCallId, event.delta, conversationId)
      },
      onDone: (usage, model) => {
        const updates: Partial<Message> = { isStreaming: false }
        if (model)
          updates.model = model
        if (usage && usage.totalTokens > 0)
          updates.usage = usage

        options.updateMessage(assistantMessageId, updates, conversationId)
        const doneState = options.getConversationRuntimeState(conversationId)
        doneState.currentStreamingMessageId = null
        doneState.isLoading = false

        if (isNewConversation && conversationId)
          void options.generateTitle(conversationId)
        if (isPlanningTurn)
          options.onPlanPreviewDone?.(conversationId)
      },
      onError: (code, message) => {
        options.setError({ code, message }, conversationId)
        const errorState = options.getConversationRuntimeState(conversationId)
        options.updateMessage(assistantMessageId, {
          isStreaming: false,
          content: errorState.messages.find(m => m.id === assistantMessageId)?.content || '',
        }, conversationId)
        errorState.currentStreamingMessageId = null
        errorState.isLoading = false
        if (isPlanningTurn)
          options.onPlanPreviewDone?.(conversationId)
      },
      isStillStreaming: () => options.getConversationRuntimeState(conversationId).currentStreamingMessageId === assistantMessageId,
      onMissingTerminalEvent: () => {
        options.updateMessage(assistantMessageId, { isStreaming: false }, conversationId)
        const fallbackState = options.getConversationRuntimeState(conversationId)
        fallbackState.currentStreamingMessageId = null
        fallbackState.isLoading = false
        if (isPlanningTurn)
          options.onPlanPreviewDone?.(conversationId)
      },
    })

    await processMessageQueue(conversationId)
    return conversationId
  }

  async function processMessageQueue(conversationId: string | null = options.currentConversationId.value) {
    if (!conversationId)
      return

    const runtimeState = options.getConversationRuntimeState(conversationId)
    if (runtimeState.isProcessingQueue || runtimeState.isLoading || runtimeState.messageQueue.length === 0)
      return

    runtimeState.isProcessingQueue = true
    try {
      while (runtimeState.messageQueue.length > 0) {
        const next = runtimeState.messageQueue.shift()!
        await sendMessage(next.content, undefined, conversationId)
      }
    }
    finally {
      runtimeState.isProcessingQueue = false
    }
  }

  function removeFromQueue(id: string, conversationId: string | null = options.currentConversationId.value) {
    const queue = options.getConversationRuntimeState(conversationId).messageQueue
    const index = queue.findIndex(m => m.id === id)
    if (index !== -1)
      queue.splice(index, 1)
  }

  function editQueueItem(id: string, newContent: string, conversationId: string | null = options.currentConversationId.value) {
    const item = options.getConversationRuntimeState(conversationId).messageQueue.find(m => m.id === id)
    if (item)
      item.content = newContent
  }

  async function stopGeneration() {
    const conversationId = options.currentConversationId.value
    if (!conversationId)
      return

    const runtimeState = options.getConversationRuntimeState(conversationId)
    if (!runtimeState.currentStreamingMessageId)
      return

    await abortChat(conversationId)
    options.updateMessage(runtimeState.currentStreamingMessageId, { isStreaming: false }, conversationId)
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false

    await processMessageQueue(conversationId)
  }

  async function saveEditMessage(messageId: string, newContent: string): Promise<string | null> {
    const conversationId = options.currentConversationId.value
    const runtimeState = options.getConversationRuntimeState(conversationId)
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

    if (newContent.trim() === message.content.trim())
      return null

    const historyBeforeEdit = runtimeState.messages.slice(0, messageIndex)
    const backendKeepCount = computeBackendKeepCount(historyBeforeEdit)

    if (conversationId)
      await truncateMessages(conversationId, backendKeepCount)

    runtimeState.messages = historyBeforeEdit
    await sendMessage(newContent.trim(), options.messagesToCoreMessages(historyBeforeEdit), conversationId ?? undefined)
    return conversationId
  }

  async function retryFromMessage(messageId: string): Promise<string | null> {
    const conversationId = options.currentConversationId.value
    const runtimeState = options.getConversationRuntimeState(conversationId)
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

    const historyBeforeRetry = runtimeState.messages.slice(0, messageIndex)
    const backendKeepCount = computeBackendKeepCount(historyBeforeRetry)

    if (conversationId)
      await truncateMessages(conversationId, backendKeepCount)

    runtimeState.messages = historyBeforeRetry
    await sendMessage(message.content, options.messagesToCoreMessages(historyBeforeRetry), conversationId ?? undefined)
    return conversationId
  }

  return {
    sendMessage,
    processMessageQueue,
    removeFromQueue,
    editQueueItem,
    stopGeneration,
    saveEditMessage,
    retryFromMessage,
  }
}
