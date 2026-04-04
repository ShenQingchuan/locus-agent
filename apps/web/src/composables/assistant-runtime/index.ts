import type { AssistantRuntimeManager, CreateAssistantRuntimeManagerOptions, Message, TodoTask } from './types'
import type { PendingApproval, PendingQuestion } from '@/api/chat'
import { computed, ref } from 'vue'
import { applyConversationData, messagesToCoreMessages } from './converters'
import { createLifecycleMutators } from './mutators/lifecycle'
import { createMessageMutators } from './mutators/messages'
import { createPendingMutators } from './mutators/pending'
import { createToolCallMutators } from './mutators/toolCalls'
import { createConversationRuntimeState } from './types'

export { convertApiMessageToUIMessage, messagesToCoreMessages, reconstructToolCallStates } from './converters'
export * from './types'

export function createAssistantRuntimeManager(options: CreateAssistantRuntimeManagerOptions): AssistantRuntimeManager {
  const conversationRuntimeStates = ref<Record<string, ReturnType<typeof createConversationRuntimeState>>>({})
  const draftRuntimeState = ref<ReturnType<typeof createConversationRuntimeState>>(createConversationRuntimeState())

  function ensureConversationRuntimeState(conversationId: string) {
    const existing = conversationRuntimeStates.value[conversationId]
    if (existing)
      return existing

    const created = createConversationRuntimeState()
    conversationRuntimeStates.value[conversationId] = created
    return created
  }

  function getConversationRuntimeState(conversationId: string | null | undefined = options.currentConversationId.value) {
    if (!conversationId)
      return draftRuntimeState.value
    return ensureConversationRuntimeState(conversationId)
  }

  function clearConversationRuntimeState(conversationId: string | null | undefined = options.currentConversationId.value) {
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
  const error = computed<import('./types').AssistantError>({
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
  const messageQueue = computed<import('./types').QueuedMessage[]>({
    get: () => getConversationRuntimeState().messageQueue,
    set: value => (getConversationRuntimeState().messageQueue = value),
  })
  const isProcessingQueue = computed<boolean>({
    get: () => getConversationRuntimeState().isProcessingQueue,
    set: value => (getConversationRuntimeState().isProcessingQueue = value),
  })

  const messageMutators = createMessageMutators(getConversationRuntimeState)
  const toolCallMutators = createToolCallMutators(getConversationRuntimeState)
  const pendingMutators = createPendingMutators(getConversationRuntimeState)
  const lifecycleMutators = createLifecycleMutators(getConversationRuntimeState)

  return {
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
    applyConversationData: (data, conversationId) => applyConversationData(
      data,
      getConversationRuntimeState,
      conversationId ?? options.currentConversationId.value,
      options.onConversationDataApplied,
    ),
    messagesToCoreMessages,
    ...messageMutators,
    ...toolCallMutators,
    ...pendingMutators,
    ...lifecycleMutators,
  }
}
