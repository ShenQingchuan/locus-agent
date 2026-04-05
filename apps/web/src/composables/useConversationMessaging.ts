import type { CodingExecutorType, Conversation, CoreMessage, LLMProviderType, MessageImageAttachment, MessageMetadata, PlanBinding } from '@univedge/locus-agent-sdk'
import type { Ref } from 'vue'
import type { Message } from '@/composables/assistant-runtime'
import type { ConversationScope } from '@/composables/useConversationScopeState'
import { abortChat } from '@/api/chat'
import { truncateMessages } from '@/api/conversations'
import { streamAssistantReply } from '@/composables/useAssistantStreaming'
import { buildAssistantModel, computeBackendKeepCount, createOptimisticConversation } from '@/utils/messaging'

interface RuntimeState {
  messages: Message[]
  isLoading: boolean
  error: { code: string, message: string } | null
  currentStreamingMessageId: string | null
  messageQueue: Array<{ id: string, content: string, attachments?: MessageImageAttachment[] }>
  isProcessingQueue: boolean
  pendingApprovals: Map<string, unknown>
  pendingQuestions: Map<string, unknown>
}

export interface SendMessageOptions {
  /** 附加到用户消息的元数据 — 含 trigger 字段时消息不在 UI 渲染 */
  metadata?: MessageMetadata
  /** 用户上传的图片附件 */
  attachments?: MessageImageAttachment[]
}

interface StateContext {
  currentConversationId: Ref<string | null>
  conversationScope: Ref<ConversationScope>
  yoloMode: Ref<boolean>
  thinkMode: Ref<boolean>
  codingMode: Ref<'build' | 'plan'>
  codingExecutor: Ref<CodingExecutorType | null>
  provider: Ref<LLMProviderType>
  modelName: Ref<string>
  conversations: Ref<Conversation[]>
}

interface RuntimeActions {
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
}

interface MessagingCallbacks {
  generateTitle: (conversationId: string) => Promise<void>
  onWritePlanDetected?: (conversationId: string, filename: string, content: string) => void
  getPlanBinding?: (conversationId: string) => PlanBinding | undefined
  onPlanPreviewStart?: (conversationId: string) => void
  onPlanPreviewDelta?: (conversationId: string, delta: string) => void
  onPlanPreviewDone?: (conversationId: string) => void
}

interface CreateConversationMessagingOptions {
  state: StateContext
  runtime: RuntimeActions
  callbacks: MessagingCallbacks
}

export function createConversationMessagingActions(options: CreateConversationMessagingOptions) {
  const { state, runtime, callbacks } = options

  async function sendMessage(
    content: string,
    historyMessages?: CoreMessage[],
    targetConversationId?: string,
    optionsOverride?: SendMessageOptions,
  ): Promise<string | null> {
    const trimmedContent = content.trim()
    const attachments = optionsOverride?.attachments
    const hasAttachments = !!attachments && attachments.length > 0

    if (!trimmedContent && !hasAttachments)
      return null

    let conversationId = targetConversationId ?? state.currentConversationId.value
    let isNewConversation = false

    if (!conversationId) {
      const optimisticConversation = createOptimisticConversation(
        content,
        state.conversationScope.value,
        state.yoloMode.value,
      )
      conversationId = optimisticConversation.id
      isNewConversation = true
      if (!targetConversationId) {
        state.currentConversationId.value = conversationId
      }
      state.conversations.value = [optimisticConversation, ...state.conversations.value]
    }

    const runtimeState = runtime.getConversationRuntimeState(conversationId)
    if (runtimeState.isLoading && !historyMessages) {
      runtimeState.messageQueue.push({
        id: crypto.randomUUID(),
        content,
        attachments,
      })
      return conversationId
    }

    runtime.clearError(conversationId)

    // 后端从 DB 加载历史，正常发送时不需要传 messages
    // 仅 edit/retry 场景会传入 historyMessages（用于 truncate 后的状态同步）
    const historyToSend = historyMessages

    runtime.addMessage({
      role: 'user',
      content,
      attachments,
      metadata: optionsOverride?.metadata,
    }, conversationId)

    const assistantModel = buildAssistantModel({
      conversationScope: state.conversationScope.value,
      codingExecutor: state.codingExecutor.value,
      provider: state.provider.value,
      modelName: state.modelName.value,
    })
    const isPlanningTurn = state.conversationScope.value.space === 'coding' && state.codingMode.value === 'plan'

    if (isPlanningTurn)
      callbacks.onPlanPreviewStart?.(conversationId)

    const assistantMessageId = runtime.addMessage({
      role: 'assistant',
      content: '',
      model: assistantModel,
      isStreaming: true,
    }, conversationId)

    runtime.setLoading(true, conversationId)
    runtime.getConversationRuntimeState(conversationId).currentStreamingMessageId = assistantMessageId

    await streamAssistantReply({
      conversationId,
      assistantMessageId,
      message: content,
      attachments,
      messages: historyToSend,
      scope: state.conversationScope.value,
      confirmMode: !state.yoloMode.value,
      thinkingMode: state.thinkMode.value,
      codingMode: state.conversationScope.value.space === 'coding' ? state.codingMode.value : undefined,
      codingExecutor: state.codingExecutor.value || undefined,
      planBinding: state.conversationScope.value.space === 'coding' && state.codingMode.value === 'build'
        ? callbacks.getPlanBinding?.(conversationId)
        : undefined,
      messageMetadata: optionsOverride?.metadata,
      onReasoningDelta: (delta) => {
        runtime.appendReasoningToMessage(assistantMessageId, delta, conversationId)
      },
      onTextDelta: (delta) => {
        if (!isPlanningTurn) {
          runtime.appendToMessage(assistantMessageId, delta, conversationId)
        }
        // Plan 模式：丢弃 text delta（含 provider 会话废话），
        // 计划内容统一由 onWritePlanDetected 从 write_plan tool args 获取
      },
      onToolCallStart: (toolCall) => {
        runtime.addToolCallToMessage(assistantMessageId, toolCall, conversationId)

        if (conversationId && toolCall.toolName === 'write_plan') {
          const filename = typeof toolCall.args?.filename === 'string' ? toolCall.args.filename.trim() : ''
          const content = typeof toolCall.args?.content === 'string' ? toolCall.args.content : ''
          if (filename && content) {
            callbacks.onWritePlanDetected?.(conversationId, filename, content)
          }
        }
      },
      onToolCallResult: (toolResult) => {
        runtime.updateToolCallResult(assistantMessageId, toolResult, conversationId)
      },
      onToolPendingApproval: (approval) => {
        runtime.addPendingApproval(approval, conversationId)
        runtime.setToolCallAwaitingApproval(assistantMessageId, approval.toolCallId, conversationId)
      },
      onQuestionPending: (question) => {
        runtime.addPendingQuestion(question, conversationId)
        runtime.setToolCallAwaitingQuestion(assistantMessageId, question.toolCallId, conversationId)
      },
      onToolOutputDelta: (toolCallId, stream, delta) => {
        void stream
        runtime.appendToolCallOutput(toolCallId, delta, conversationId)
      },
      onDelegateDelta: (event) => {
        runtime.appendDelegateDelta(event.toolCallId, event.delta, conversationId)
      },
      onDone: (usage, model) => {
        const updates: Partial<Message> = { isStreaming: false }
        if (model)
          updates.model = model
        if (usage && usage.totalTokens > 0)
          updates.usage = usage

        runtime.updateMessage(assistantMessageId, updates, conversationId)
        const doneState = runtime.getConversationRuntimeState(conversationId)
        doneState.currentStreamingMessageId = null
        doneState.isLoading = false

        if (isNewConversation && conversationId)
          void callbacks.generateTitle(conversationId)
        if (isPlanningTurn)
          callbacks.onPlanPreviewDone?.(conversationId)
      },
      onError: (code, message) => {
        runtime.setError({ code, message }, conversationId)
        const errorState = runtime.getConversationRuntimeState(conversationId)
        runtime.updateMessage(assistantMessageId, {
          isStreaming: false,
          content: errorState.messages.find(m => m.id === assistantMessageId)?.content || '',
        }, conversationId)
        errorState.currentStreamingMessageId = null
        errorState.isLoading = false
        if (isPlanningTurn)
          callbacks.onPlanPreviewDone?.(conversationId)
      },
      onMissingTerminalEvent: () => {
        runtime.updateMessage(assistantMessageId, { isStreaming: false }, conversationId)
        const fallbackState = runtime.getConversationRuntimeState(conversationId)
        fallbackState.currentStreamingMessageId = null
        fallbackState.isLoading = false
        if (isPlanningTurn)
          callbacks.onPlanPreviewDone?.(conversationId)
      },
    })

    await processMessageQueue(conversationId)
    return conversationId
  }

  async function processMessageQueue(conversationId: string | null = state.currentConversationId.value) {
    if (!conversationId)
      return

    const runtimeState = runtime.getConversationRuntimeState(conversationId)
    if (runtimeState.isProcessingQueue || runtimeState.isLoading || runtimeState.messageQueue.length === 0)
      return

    runtimeState.isProcessingQueue = true
    try {
      while (runtimeState.messageQueue.length > 0) {
        const next = runtimeState.messageQueue.shift()!
        await sendMessage(next.content, undefined, conversationId, { attachments: next.attachments })
      }
    }
    finally {
      runtimeState.isProcessingQueue = false
    }
  }

  function removeFromQueue(id: string, conversationId: string | null = state.currentConversationId.value) {
    const queue = runtime.getConversationRuntimeState(conversationId).messageQueue
    const index = queue.findIndex(m => m.id === id)
    if (index !== -1)
      queue.splice(index, 1)
  }

  function editQueueItem(id: string, newContent: string, conversationId: string | null = state.currentConversationId.value) {
    const item = runtime.getConversationRuntimeState(conversationId).messageQueue.find(m => m.id === id)
    if (item)
      item.content = newContent
  }

  async function stopGeneration() {
    const conversationId = state.currentConversationId.value
    if (!conversationId)
      return

    const runtimeState = runtime.getConversationRuntimeState(conversationId)
    if (!runtimeState.currentStreamingMessageId)
      return

    await abortChat(conversationId)

    // Interrupt any tool calls that were mid-execution when the user stopped.
    // Without this, their loading spinners remain visible indefinitely.
    const streamingMessage = runtimeState.messages.find(
      m => m.id === runtimeState.currentStreamingMessageId,
    )
    const interruptedToolCalls = streamingMessage?.toolCalls?.map(tc =>
      tc.status === 'pending' || tc.status === 'awaiting-approval' || tc.status === 'awaiting-question'
        ? { ...tc, status: 'interrupted' as const }
        : tc,
    )

    runtime.updateMessage(
      runtimeState.currentStreamingMessageId,
      {
        isStreaming: false,
        ...(interruptedToolCalls ? { toolCalls: interruptedToolCalls } : {}),
      },
      conversationId,
    )
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false

    await processMessageQueue(conversationId)
  }

  async function saveEditMessage(messageId: string, newContent: string, attachments?: MessageImageAttachment[]): Promise<string | null> {
    const conversationId = state.currentConversationId.value
    const runtimeState = runtime.getConversationRuntimeState(conversationId)
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
    await sendMessage(
      newContent,
      runtime.messagesToCoreMessages(historyBeforeEdit),
      conversationId ?? undefined,
      { attachments },
    )
    return conversationId
  }

  async function retryFromMessage(messageId: string): Promise<string | null> {
    const conversationId = state.currentConversationId.value
    const runtimeState = runtime.getConversationRuntimeState(conversationId)
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
    await sendMessage(
      message.content,
      runtime.messagesToCoreMessages(historyBeforeRetry),
      conversationId ?? undefined,
      { attachments: message.attachments },
    )
    return conversationId
  }

  async function deleteMessagesFrom(messageId: string): Promise<boolean> {
    const conversationId = state.currentConversationId.value
    if (!conversationId) {
      console.warn('[deleteMessagesFrom] 没有活动的会话')
      return false
    }

    const runtimeState = runtime.getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    if (messageIndex === -1) {
      console.warn('[deleteMessagesFrom] 未找到消息:', messageId)
      return false
    }

    const historyBeforeDelete = runtimeState.messages.slice(0, messageIndex)
    const backendKeepCount = computeBackendKeepCount(historyBeforeDelete)

    // 先截断后端消息
    await truncateMessages(conversationId, backendKeepCount)

    // 再更新前端状态
    runtimeState.messages = historyBeforeDelete

    // 清理相关状态
    runtimeState.error = null
    runtimeState.currentStreamingMessageId = null
    runtimeState.isLoading = false
    runtimeState.pendingApprovals.clear()
    runtimeState.pendingQuestions.clear()
    runtimeState.isProcessingQueue = false

    return true
  }

  return {
    sendMessage,
    processMessageQueue,
    removeFromQueue,
    editQueueItem,
    stopGeneration,
    saveEditMessage,
    retryFromMessage,
    deleteMessagesFrom,
  }
}
