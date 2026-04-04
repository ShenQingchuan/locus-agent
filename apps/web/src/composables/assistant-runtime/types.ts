import type {
  Message as ApiMessage,
  Conversation,
  CoreMessage,
  DelegateDelta,
  MessageImageAttachment,
  ToolCall,
  ToolResult,
} from '@univedge/locus-agent-sdk'
import type { ComputedRef, Ref } from 'vue'
import type { PendingApproval, PendingQuestion } from '@/api/chat'
import type { TodoTask } from '@/utils/parsers'

export interface ToolCallState {
  toolCall: ToolCall
  result?: ToolResult
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval' | 'awaiting-question' | 'interrupted'
  output?: string
  delegateDeltas?: DelegateDelta[]
}

export type MessagePart
  = | { type: 'reasoning', content: string }
    | { type: 'text', content: string }
    | { type: 'tool-call', toolCallIndex: number }

export interface QueuedMessage {
  id: string
  content: string
  attachments?: MessageImageAttachment[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageImageAttachment[]
  model?: string
  timestamp: number
  toolCalls?: ToolCallState[]
  isStreaming?: boolean
  reasoning?: string
  parts?: MessagePart[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** 消息元数据 — 携带 trigger 的消息不在 UI 渲染 */
  metadata?: { trigger?: string }
}

export type { TodoTask } from '@/utils/parsers'

export type AssistantError = { code: string, message: string } | null

export interface ConversationRuntimeState {
  messages: Message[]
  todoTasks: TodoTask[]
  isLoading: boolean
  error: AssistantError
  currentStreamingMessageId: string | null
  pendingApprovals: Map<string, PendingApproval>
  pendingQuestions: Map<string, PendingQuestion>
  messageQueue: QueuedMessage[]
  isProcessingQueue: boolean
}

export function createConversationRuntimeState(): ConversationRuntimeState {
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

export interface AssistantRuntimeManager {
  messages: ComputedRef<Message[]>
  todoTasks: ComputedRef<TodoTask[]>
  isLoading: ComputedRef<boolean>
  error: ComputedRef<AssistantError>
  currentStreamingMessageId: ComputedRef<string | null>
  pendingApprovals: ComputedRef<Map<string, PendingApproval>>
  pendingQuestions: ComputedRef<Map<string, PendingQuestion>>
  messageQueue: ComputedRef<QueuedMessage[]>
  isProcessingQueue: ComputedRef<boolean>
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState
  clearConversationRuntimeState: (conversationId?: string | null) => void
  removeConversationRuntimeState: (conversationId: string) => void
  applyConversationData: (data: { conversation: Conversation, messages: ApiMessage[] }, conversationId?: string | null) => void
  messagesToCoreMessages: (msgs: Message[]) => CoreMessage[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>, conversationId?: string | null) => string
  updateMessage: (id: string, updates: Partial<Message>, conversationId?: string | null) => void
  appendToMessage: (id: string, content: string, conversationId?: string | null) => void
  appendReasoningToMessage: (id: string, content: string, conversationId?: string | null) => void
  addToolCallToMessage: (id: string, toolCall: ToolCall, conversationId?: string | null) => void
  updateToolCallResult: (messageId: string, toolResult: ToolResult, conversationId?: string | null) => void
  appendToolCallOutput: (toolCallId: string, delta: string, conversationId?: string | null) => void
  appendDelegateDelta: (toolCallId: string, delta: DelegateDelta, conversationId?: string | null) => void
  setToolCallAwaitingApproval: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  setToolCallAwaitingQuestion: (messageId: string, toolCallId: string, conversationId?: string | null) => void
  setToolCallExecuting: (toolCallId: string, conversationId?: string | null) => void
  addPendingApproval: (approval: PendingApproval, conversationId?: string | null) => void
  removePendingApproval: (toolCallId: string, conversationId?: string | null) => void
  clearPendingApprovals: (conversationId?: string | null) => void
  addPendingQuestion: (question: PendingQuestion, conversationId?: string | null) => void
  removePendingQuestion: (toolCallId: string, conversationId?: string | null) => void
  clearMessages: (conversationId?: string | null) => void
  deleteMessagesFrom: (messageId: string, conversationId?: string | null) => boolean
  setLoading: (loading: boolean, conversationId?: string | null) => void
  setError: (err: AssistantError, conversationId?: string | null) => void
  clearError: (conversationId?: string | null) => void
}

export interface CreateAssistantRuntimeManagerOptions {
  currentConversationId: Ref<string | null>
  onConversationDataApplied?: (args: {
    conversationId: string
    conversation: Conversation
  }) => void
}
