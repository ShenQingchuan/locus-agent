import type { ToolExecutionContext, ToolOutputCallbacks } from '@univedge/locus-agent-sdk'
import type { Tool } from 'ai'
import { BuiltinTool } from '@univedge/locus-agent-sdk'
import { mcpManager } from '../mcp/manager.js'
import { tools } from './tool-definitions.js'
import { getBuiltinFormattedExecutor, getBuiltinRawExecutor, hasBuiltinFormattedExecutor } from './tool-executors.js'
import { interactiveTools, isTrustedBuiltinTool, trustedBuiltinTools } from './tool-policy.js'

export { interactiveTools, isTrustedBuiltinTool, tools, trustedBuiltinTools }

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
 * Chat 空间的基础内置工具集。
 * Coding 相关能力只在 /coding 打开。
 */
const CHAT_BUILTIN_TOOLS = new Set<string>([
  BuiltinTool.Bash,
  BuiltinTool.ReadFile,
  BuiltinTool.Glob,
  BuiltinTool.Grep,
  BuiltinTool.Tree,
  BuiltinTool.AskQuestion,
  BuiltinTool.Delegate,
  BuiltinTool.ManageMemory,
  BuiltinTool.Skill,
])

const CODING_BUILD_BUILTIN_TOOLS = new Set<string>([
  ...CHAT_BUILTIN_TOOLS,
  BuiltinTool.StrReplace,
  BuiltinTool.WriteFile,
  BuiltinTool.ManageTodos,
  BuiltinTool.ManageKanban,
  BuiltinTool.ReadPlan,
])

/**
 * Plan 模式下允许的内置工具（只读 + 计划管理）
 */
const CODING_PLAN_BUILTIN_TOOLS = new Set<string>([
  BuiltinTool.Bash,
  BuiltinTool.ReadFile,
  BuiltinTool.Glob,
  BuiltinTool.Grep,
  BuiltinTool.Tree,
  BuiltinTool.AskQuestion,
  BuiltinTool.Delegate,
  BuiltinTool.ManageMemory,
  BuiltinTool.Skill,
  BuiltinTool.ManageTodos,
  BuiltinTool.WritePlan,
  BuiltinTool.ReadPlan,
  BuiltinTool.PlanExit,
])

function pickBuiltinTools(allowed: Set<string>): Record<string, Tool> {
  const filtered: Record<string, Tool> = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (allowed.has(name))
      filtered[name] = tool
  }
  return filtered
}

/**
 * 根据 space + codingMode 返回工具集：
 * - chat: 仅基础内置工具
 * - coding/build: 基础工具 + coding 专属内置工具
 * - coding/plan: 只读内置工具 + plan 专属工具
 * MCP 工具不区分 space，始终合并。
 */
export function getMergedToolsForContext(
  space: 'chat' | 'coding' = 'chat',
  codingMode?: 'build' | 'plan',
  allowlist?: string[],
): Record<string, Tool> {
  // When an explicit allowlist is provided (sub-agents), pick from ALL defined
  // tools — the allowlist itself is the authority, space filtering is irrelevant.
  if (allowlist && allowlist.length > 0) {
    const set = new Set(allowlist)
    const allTools = { ...tools, ...mcpManager.getAllTools() }
    const filtered: Record<string, Tool> = {}
    for (const [name, tool] of Object.entries(allTools)) {
      if (set.has(name))
        filtered[name] = tool
    }
    return filtered
  }

  const builtinTools = space === 'coding'
    ? (codingMode === 'plan'
        ? pickBuiltinTools(CODING_PLAN_BUILTIN_TOOLS)
        : pickBuiltinTools(CODING_BUILD_BUILTIN_TOOLS))
    : pickBuiltinTools(CHAT_BUILTIN_TOOLS)

  return {
    ...builtinTools,
    ...mcpManager.getAllTools(),
  }
}

export function getAvailableTools(): string[] {
  return Object.keys(getMergedTools())
}

export { delegateTool, executeDelegate, formatDelegateResult } from './delegate.js'
