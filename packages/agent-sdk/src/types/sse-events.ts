import type { ToolCall, ToolResult } from './tool.js'
import type { RiskLevel } from './whitelist.js'

/**
 * SSE 事件类型
 * 用于流式响应的事件定义
 */

/**
 * 文本增量事件
 * 当 AI 生成文本时逐步发送
 */
export interface TextDeltaEvent {
  type: 'text-delta'
  /** 文本增量内容 */
  textDelta: string
}

/**
 * 工具调用开始事件
 * 当 AI 决定调用工具时发送
 */
export interface ToolCallStartEvent {
  type: 'tool-call-start'
  /** 工具调用信息 */
  toolCall: ToolCall
}

/**
 * 工具调用结果事件
 * 当工具执行完成时发送
 */
export interface ToolCallResultEvent {
  type: 'tool-call-result'
  /** 工具执行结果 */
  toolResult: ToolResult
}

/**
 * 完成事件
 * 当整个响应完成时发送
 */
export interface DoneEvent {
  type: 'done'
  /** 完整的响应消息 ID */
  messageId: string
  /** 生成该消息使用的模型（格式：provider/model） */
  model?: string
  /** 使用的 token 数量 */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 错误事件
 * 当发生错误时发送
 */
export interface ErrorEvent {
  type: 'error'
  /** 错误代码 */
  code: string
  /** 错误消息 */
  message: string
}

/**
 * 思考过程增量事件
 * 当 AI 进行推理思考时逐步发送
 */
export interface ReasoningDeltaEvent {
  type: 'reasoning-delta'
  /** 思考过程增量内容 */
  reasoningDelta: string
}

/**
 * 工具执行等待确认事件
 * 当确认模式下工具需要用户确认时发送
 */
export interface ToolPendingApprovalEvent {
  type: 'tool-pending-approval'
  /** 工具调用 ID */
  toolCallId: string
  /** 工具名称 */
  toolName: string
  /** 工具参数 */
  args: Record<string, unknown>
  /** 建议的匹配前缀（服务端预计算） */
  suggestedPattern?: string
  /** 风险等级（服务端预计算） */
  riskLevel?: RiskLevel
}

/**
 * 工具输出增量事件
 * 当工具（如 bash）执行中产生流式输出时逐步发送
 */
export interface ToolOutputDeltaEvent {
  type: 'tool-output-delta'
  /** 工具调用 ID */
  toolCallId: string
  /** 输出流类型 */
  stream: 'stdout' | 'stderr'
  /** 增量内容 */
  delta: string
}

/**
 * 提问等待回答事件
 * 当 AI 使用 ask_question 工具向用户提问时发送
 */
export interface QuestionPendingEvent {
  type: 'question-pending'
  /** 工具调用 ID */
  toolCallId: string
  /** 问题列表 */
  questions: Array<{
    /** 问题文本 */
    question: string
    /** 预设选项 */
    options: string[]
    /** 是否允许多选 */
    multiple?: boolean
  }>
}

/**
 * Delegate 子代理状态增量数据
 * 可复用于 SSE 事件和客户端 store 状态
 */
export interface DelegateDelta {
  /** 增量类型 */
  type: 'text' | 'reasoning' | 'tool_start' | 'tool_result'
  /** 增量内容 */
  content: string
  /** 工具名称（仅 tool_start 和 tool_result 类型有） */
  toolName?: string
  /** 是否错误（仅 tool_result 类型有） */
  isError?: boolean
  /**
   * Sub-agent tool call ID — used to correctly pair tool_start / tool_result
   * deltas when multiple tools run in parallel inside a delegate.
   */
  toolCallId?: string
}

/**
 * Delegate 子代理状态增量事件
 * 当子代理执行过程中产生状态更新时逐步发送
 */
export interface DelegateDeltaEvent {
  type: 'delegate-delta'
  /** 工具调用 ID */
  toolCallId: string
  /** 状态增量数据 */
  delta: DelegateDelta
}

/**
 * 所有 SSE 事件类型的联合类型
 */
export type SSEEvent
  = | TextDeltaEvent
    | ReasoningDeltaEvent
    | ToolCallStartEvent
    | ToolCallResultEvent
    | DoneEvent
    | ErrorEvent
    | ToolPendingApprovalEvent
    | ToolOutputDeltaEvent
    | QuestionPendingEvent
    | DelegateDeltaEvent

/**
 * SSE 事件类型字符串
 */
export type SSEEventType = SSEEvent['type']

/**
 * 根据事件类型获取事件数据类型
 */
export type SSEEventData<T extends SSEEventType> = Extract<SSEEvent, { type: T }>
