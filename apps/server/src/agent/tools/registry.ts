import type { Tool } from 'ai'
import type { BashResult } from './bash.js'
import type { ReadFileResult } from './read.js'
import type { StrReplaceResult } from './str-replace.js'
import type { WriteFileResult } from './write.js'
import { mcpManager } from '../mcp/manager.js'
import { bashTool, executeBash, formatBashResult } from './bash.js'
import { executeReadFile, formatReadResult, readFileTool } from './read.js'
import { executeStrReplace, formatStrReplaceResult, strReplaceTool } from './str-replace.js'
import { executeWriteFile, formatWriteResult, writeFileTool } from './write.js'

/**
 * All tool definitions exposed to the LLM.
 */
export const tools = {
  bash: bashTool,
  read_file: readFileTool,
  str_replace: strReplaceTool,
  write_file: writeFileTool,
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
  str_replace: async (args) => {
    const result = await executeStrReplace(args as Parameters<typeof executeStrReplace>[0])
    return formatStrReplaceResult(result)
  },
  write_file: async (args) => {
    const result = await executeWriteFile(args as Parameters<typeof executeWriteFile>[0])
    return formatWriteResult(result)
  },
}

/**
 * Executors that return raw structured objects (for programmatic use).
 */
const toolRawExecutors: Record<ToolName, ToolExecutor> = {
  bash: executeBash as ToolExecutor,
  read_file: executeReadFile as ToolExecutor,
  str_replace: executeStrReplace as ToolExecutor,
  write_file: executeWriteFile as ToolExecutor,
}

/**
 * 执行工具调用（内置优先，其次 MCP）
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns 格式化后的结果字符串
 */
export async function executeToolCall(toolName: string, args: unknown): Promise<string> {
  // 内置工具
  const builtinExecutor = toolExecutors[toolName as ToolName]
  if (builtinExecutor) {
    const result = await builtinExecutor(args)
    return typeof result === 'string' ? result : JSON.stringify(result)
  }
  // MCP 工具
  if (mcpManager.hasTool(toolName)) {
    return mcpManager.executeToolCall(toolName, args)
  }
  throw new Error(`Unknown tool: ${toolName}`)
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
 * 检查内置工具是否存在
 */
export function hasBuiltinToolExecutor(toolName: string): boolean {
  return toolName in toolExecutors
}

/**
 * 检查工具是否存在（内置 + MCP）
 */
export function hasToolExecutor(toolName: string): boolean {
  return hasBuiltinToolExecutor(toolName) || mcpManager.hasTool(toolName)
}

/**
 * 获取所有内置 + MCP 工具（schema-only, 用于传给 streamText）
 */
export function getMergedTools(): Record<string, Tool> {
  return {
    ...tools,
    ...mcpManager.getAllTools(),
  }
}

/**
 * 获取所有可用工具名称
 */
export function getAvailableTools(): string[] {
  return Object.keys(getMergedTools())
}

// Re-export types for external consumers
export type { BashResult, ReadFileResult, StrReplaceResult, WriteFileResult }
