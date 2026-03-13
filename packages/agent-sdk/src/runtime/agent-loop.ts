import type { DelegateDelta } from '../types/sse-events.js'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface AgentLoopCallbacks {
  onTextDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => void | Promise<void>
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
  onFinish?: (finishReason: string, usage: TokenUsage) => void | Promise<void>
}

export interface QuestionItem {
  question: string
  options: string[]
  multiple?: boolean
}

export interface QuestionAnswer {
  question: string
  answer: string | string[]
}

export interface AgentLoopOptions<TModel = unknown, TMessage = unknown> {
  messages: TMessage[]
  systemPrompt?: string
  model: TModel
  callbacks?: AgentLoopCallbacks
  maxIterations?: number
  abortSignal?: AbortSignal
  confirmMode?: boolean | (() => boolean)
  thinkingMode?: boolean
  space?: 'chat' | 'coding'
  codingMode?: 'build' | 'plan'
  getToolApproval?: (toolCallId: string, toolName: string, args: unknown) => Promise<boolean>
  onQuestionPending?: (toolCallId: string, questions: QuestionItem[]) => void | Promise<void>
  getQuestionAnswer?: (toolCallId: string, questions: QuestionItem[]) => Promise<QuestionAnswer[]>
  conversationId?: string
  projectKey?: string
  workspaceRoot?: string
  toolTimeoutMs?: number
  toolAllowlist?: string[]
}

export interface AgentLoopResult<TMessage = unknown> {
  text: string
  finishReason: string
  usage: TokenUsage
  iterations: number
  messages: TMessage[]
}

export interface PendingToolCall {
  toolCallId: string
  toolName: string
  args: unknown
}
