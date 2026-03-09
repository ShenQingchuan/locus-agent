import type { CoreMessage, MessageImageAttachment, MessageMetadata, PlanBinding, RiskLevel, SSEEvent, ToolCall, ToolResult } from '@locus-agent/agent-sdk'

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  suggestedPattern?: string
  riskLevel?: RiskLevel
}

export interface QuestionAnswer {
  question: string
  answer: string
}

export interface PendingQuestion {
  toolCallId: string
  questions: Array<{
    question: string
    options: string[]
    multiple?: boolean
  }>
}

export interface DelegateDeltaEvent {
  toolCallId: string
  delta: {
    type: 'text' | 'reasoning' | 'tool_start' | 'tool_result'
    content: string
    toolName?: string
    isError?: boolean
  }
}

export interface ChatStreamOptions {
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
  onReasoningDelta?: (delta: string) => void
  onTextDelta?: (delta: string) => void
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallResult?: (toolResult: ToolResult) => void
  onToolPendingApproval?: (approval: PendingApproval) => void
  onQuestionPending?: (question: PendingQuestion) => void
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void
  onDelegateDelta?: (event: DelegateDeltaEvent) => void
  onDone?: (messageId: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number }, model?: string) => void
  onError?: (code: string, message: string) => void
}

export interface ConversationPlansResponse {
  currentPlan: {
    filename: string
    content: string
  } | null
}

export type { SSEEvent }
