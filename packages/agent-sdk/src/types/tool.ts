/**
 * 工具调用和结果类型定义
 * 符合 Vercel AI SDK 的格式
 */

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具调用唯一标识 */
  toolCallId: string
  /** 工具名称 */
  toolName: string
  /** 工具参数 */
  args: Record<string, unknown>
}

/**
 * 工具调用结果
 */
export interface ToolResult {
  /** 对应的工具调用 ID */
  toolCallId: string
  /** 工具名称 */
  toolName: string
  /** 工具执行结果 */
  result: unknown
  /** 是否执行出错 */
  isError?: boolean
  /** 是否被中断 */
  isInterrupted?: boolean
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>
}
