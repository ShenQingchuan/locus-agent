import type { ToolCall, ToolResult } from './tool.js'

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
}

/**
 * 所有 SSE 事件类型的联合类型
 */
export type SSEEvent
  = | TextDeltaEvent
    | ToolCallStartEvent
    | ToolCallResultEvent
    | DoneEvent
    | ErrorEvent
    | ToolPendingApprovalEvent

/**
 * SSE 事件类型字符串
 */
export type SSEEventType = SSEEvent['type']

/**
 * 根据事件类型获取事件数据类型
 */
export type SSEEventData<T extends SSEEventType> = Extract<SSEEvent, { type: T }>
