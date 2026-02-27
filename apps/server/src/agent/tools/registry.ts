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

export function getAvailableTools(): string[] {
  return Object.keys(getMergedTools())
}

export type { BashResult, GlobResult, ReadFileResult, StrReplaceResult, WriteFileResult }

export { delegateTool, executeDelegate, formatDelegateResult } from './delegate.js'
export type { DelegateArgs, DelegateResult, SubAgentConfig } from './delegate.js'
