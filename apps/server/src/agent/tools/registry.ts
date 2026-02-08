import type { BashResult } from './bash.js'
import type { EditFileResult } from './edit.js'
import type { ReadFileResult } from './read.js'
import { bashTool, executeBash, formatBashResult } from './bash.js'
import { editFileTool, executeEditFile, formatEditResult } from './edit.js'
import { executeReadFile, formatReadResult, readFileTool } from './read.js'

/**
 * All tool definitions exposed to the LLM.
 */
export const tools = {
  bash: bashTool,
  read_file: readFileTool,
  edit_file: editFileTool,
}

/**
 * Tool name union type derived from the registry.
 */
export type ToolName = keyof typeof tools

/**
 * Generic executor signature.
 */
type ToolExecutor<T = unknown, R = unknown> = (args: T) => Promise<R>

/**
 * Executors that return a formatted string (fed back to the LLM).
 */
const toolExecutors: Record<ToolName, ToolExecutor> = {
  bash: async (args) => {
    const result = await executeBash(args as { command: string, timeout?: number })
    return formatBashResult(result)
  },
  read_file: async (args) => {
    const result = await executeReadFile(args as { file_path: string, offset?: number, limit?: number })
    return formatReadResult(result)
  },
  edit_file: async (args) => {
    const result = await executeEditFile(args as Parameters<typeof executeEditFile>[0])
    return formatEditResult(result)
  },
}

/**
 * Executors that return raw structured objects (for programmatic use).
 */
const toolRawExecutors: Record<ToolName, ToolExecutor> = {
  bash: executeBash as ToolExecutor,
  read_file: executeReadFile as ToolExecutor,
  edit_file: executeEditFile as ToolExecutor,
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

// Re-export types for external consumers
export type { BashResult, EditFileResult, ReadFileResult }
