import type { Tool } from 'ai'
import type { BashResult } from './bash.js'
import type { GlobResult } from './glob.js'
import type { ReadFileResult } from './read.js'
import type { StrReplaceResult } from './str-replace.js'
import type { ToolName } from './tool-definitions.js'
import type { ToolExecutionContext, ToolOutputCallbacks } from './tool-runtime-types.js'
import type { WriteFileResult } from './write.js'
import { mcpManager } from '../mcp/manager.js'
import { tools } from './tool-definitions.js'
import { getBuiltinFormattedExecutor, getBuiltinRawExecutor, hasBuiltinFormattedExecutor } from './tool-executors.js'
import { interactiveTools, isTrustedBuiltinTool, trustedBuiltinTools } from './tool-policy.js'

export { interactiveTools, isTrustedBuiltinTool, tools, trustedBuiltinTools }
export type { ToolExecutionContext, ToolName, ToolOutputCallbacks }

export async function executeToolCall(
  toolName: string,
  args: unknown,
  callbacks?: ToolOutputCallbacks,
  context?: ToolExecutionContext,
): Promise<string> {
  if (interactiveTools.has(toolName)) {
    throw new Error(`Interactive tool "${toolName}" must be handled by the agent loop`)
  }

  const builtinExecutor = getBuiltinFormattedExecutor(toolName)
  if (builtinExecutor) {
    const result = await builtinExecutor(args, callbacks, context)
    return typeof result === 'string' ? result : JSON.stringify(result)
  }

  if (mcpManager.hasTool(toolName)) {
    return mcpManager.executeToolCall(toolName, args)
  }

  throw new Error(`Unknown tool: ${toolName}`)
}

export async function executeToolCallRaw(toolName: string, args: unknown): Promise<unknown> {
  const executor = getBuiltinRawExecutor(toolName)
  if (!executor) {
    throw new Error(`Unknown tool: ${toolName}`)
  }
  return executor(args)
}

export function hasBuiltinToolExecutor(toolName: string): boolean {
  return hasBuiltinFormattedExecutor(toolName) || interactiveTools.has(toolName)
}

export function hasToolExecutor(toolName: string): boolean {
  return hasBuiltinToolExecutor(toolName) || mcpManager.hasTool(toolName)
}

export function getMergedTools(): Record<string, Tool> {
  return {
    ...tools,
    ...mcpManager.getAllTools(),
  }
}

/**
 * Plan 模式下允许的内置工具（只读 + 计划管理）
 */
const PLAN_MODE_ALLOWED_TOOLS = new Set<string>([
  'read_file',
  'glob',
  'search_memories',
  'write_plan',
  'read_plan',
  'ask_question',
  'manage_todos',
])

const MCP_WRITE_KEYWORDS = [
  'write',
  'create',
  'delete',
  'update',
  'edit',
  'modify',
  'remove',
  'insert',
  'patch',
  'put',
  'execute',
  'run',
  'deploy',
  'send',
]

function looksLikeWriteTool(name: string, t: Tool): boolean {
  const lowerName = name.toLowerCase()
  for (const kw of MCP_WRITE_KEYWORDS) {
    if (lowerName.includes(kw))
      return true
  }
  const desc = ((t as any).description ?? '').toLowerCase()
  if (desc.includes('write') || desc.includes('modify') || desc.includes('delete') || desc.includes('create file')) {
    return true
  }
  return false
}

/**
 * 根据 codingMode 返回对应的工具集
 * plan 模式：只返回只读工具 + 计划管理工具
 * build / undefined：返回全部工具
 */
export function getMergedToolsForMode(codingMode?: 'build' | 'plan'): Record<string, Tool> {
  if (codingMode !== 'plan')
    return getMergedTools()

  const filtered: Record<string, Tool> = {}
  for (const [name, t] of Object.entries(tools)) {
    if (PLAN_MODE_ALLOWED_TOOLS.has(name)) {
      filtered[name] = t
    }
  }
  for (const [name, t] of Object.entries(mcpManager.getAllTools())) {
    if (!looksLikeWriteTool(name, t)) {
      filtered[name] = t
    }
  }
  return filtered
}

export function getAvailableTools(): string[] {
  return Object.keys(getMergedTools())
}

export type { BashResult, GlobResult, ReadFileResult, StrReplaceResult, WriteFileResult }

export { delegateTool, executeDelegate, formatDelegateResult } from './delegate.js'
export type { DelegateArgs, DelegateResult, SubAgentConfig } from './delegate.js'
