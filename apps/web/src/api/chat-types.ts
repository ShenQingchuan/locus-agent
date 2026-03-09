import type { CoreMessage, MessageImageAttachment, MessageMetadata, ParsedDelegateDelta, PendingApproval, PendingQuestion, PlanBinding, SSEEvent, SSEEventHandlers } from '@locus-agent/agent-sdk'

export type { PendingApproval, PendingQuestion, SSEEvent }
export type { ParsedDelegateDelta as DelegateDeltaEvent }

export interface QuestionAnswer {
  question: string
  answer: string
}

export interface ChatStreamOptions extends SSEEventHandlers {
  conversationId: string
  space?: 'chat' | 'coding'
  projectKey?: string
  workspaceRoot?: string
  message: string
  attachments?: MessageImageAttachment[]
  messages?: CoreMessage[]
  confirmMode?: boolean
  thinkingMode?: boolean
  codingMode?: 'build' | 'plan'
  codingProvider?: 'kimi-code'
  planBinding?: PlanBinding
  messageMetadata?: MessageMetadata
}

export interface ConversationPlansResponse {
  currentPlan: {
    filename: string
    content: string
  } | null
}
