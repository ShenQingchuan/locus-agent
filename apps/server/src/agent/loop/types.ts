import type { LanguageModel, ModelMessage } from 'ai'
import type { QuestionAnswer, QuestionItem } from '../tools/ask_question.js'
import type { ToolExecutionContext } from '../tools/registry.js'

export interface AgentLoopOptions {
  messages: ModelMessage[]
  systemPrompt?: string
  model: LanguageModel
  onTextDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => void | Promise<void>
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  onFinish?: (finishReason: string, usage: { inputTokens: number, outputTokens: number }) => void | Promise<void>
  maxIterations?: number
  abortSignal?: AbortSignal
  confirmMode?: boolean | (() => boolean)
  thinkingMode?: boolean
  /** Coding 空间模式：build（直接编码）/ plan（先规划再编码） */
  codingMode?: 'build' | 'plan'
  getToolApproval?: (toolCallId: string, toolName: string, args: unknown) => Promise<boolean>
  onQuestionPending?: (toolCallId: string, questions: QuestionItem[]) => void | Promise<void>
  getQuestionAnswer?: (toolCallId: string, questions: QuestionItem[]) => Promise<QuestionAnswer[]>
  conversationId?: string
  projectKey?: string
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
  toolTimeoutMs?: number
}

export interface AgentLoopResult {
  text: string
  finishReason: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  iterations: number
}

export interface PendingToolCall {
  toolCallId: string
  toolName: string
  args: unknown
}

export interface DelegateDelta {
  type: 'text' | 'reasoning' | 'tool_start' | 'tool_result'
  content: string
  toolName?: string
  isError?: boolean
}

export interface ExecuteToolPipelineOptions {
  pendingToolCall: PendingToolCall
  model: LanguageModel
  shouldConfirm: () => boolean
  abortSignal?: AbortSignal
  getToolApproval?: (toolCallId: string, toolName: string, args: unknown) => Promise<boolean>
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  onQuestionPending?: (toolCallId: string, questions: QuestionItem[]) => void | Promise<void>
  getQuestionAnswer?: (toolCallId: string, questions: QuestionItem[]) => Promise<QuestionAnswer[]>
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
  conversationId?: string
  toolContext: ToolExecutionContext
  toolTimeoutMs: number
}

export interface ExecuteToolPipelineResult {
  result: unknown
  isError: boolean
  isInterrupted: boolean
}
