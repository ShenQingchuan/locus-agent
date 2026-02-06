import type { BashResult } from './bash.js'
import { bashTool, executeBash, formatBashResult } from './bash.js'

/**
 * 导出所有工具定义
 */
export const tools = {
  bash: bashTool,
}

/**
 * 工具名称类型
 */
export type ToolName = keyof typeof tools

/**
 * 工具执行器类型
 */
type ToolExecutor<T = unknown, R = unknown> = (args: T) => Promise<R>

/**
 * 工具执行函数映射
 */
const toolExecutors: Record<ToolName, ToolExecutor> = {
  bash: async (args) => {
    const result = await executeBash(args as { command: string, timeout?: number })
    return formatBashResult(result)
  },
}

/**
 * 工具原始结果执行器（返回结构化结果）
 */
const toolRawExecutors: Record<ToolName, ToolExecutor> = {
  bash: executeBash as ToolExecutor,
}

/**
 * 执行工具调用
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 格式化后的结果字符串
 */
export async function executeToolCall(toolName: string, args: unknown): Promise<string> {
  const executor = toolExecutors[toolName as ToolName]
  if (!executor) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  const result = await executor(args)
  return typeof result === 'string' ? result : JSON.stringify(result)
}

/**
 * 执行工具调用并返回原始结果
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 原始结果对象
 */
export async function executeToolCallRaw(toolName: string, args: unknown): Promise<unknown> {
  const executor = toolRawExecutors[toolName as ToolName]
  if (!executor) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  return executor(args)
}

/**
 * 检查工具是否存在
 */
export function hasToolExecutor(toolName: string): boolean {
  return toolName in toolExecutors
}

/**
 * 获取所有可用工具名称
 */
export function getAvailableTools(): ToolName[] {
  return Object.keys(tools) as ToolName[]
}

// 导出类型
export type { BashResult }
