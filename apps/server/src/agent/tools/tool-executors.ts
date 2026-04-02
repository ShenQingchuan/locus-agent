import type { StreamingToolExecutor, ToolExecutor } from '@univedge/locus-agent-sdk'
import type { ToolName } from './tool-definitions.js'
import { executeBash, formatBashResult } from './bash.js'
import { executeGlob, formatGlobResult } from './glob.js'
import { executeGrep, formatGrepResult } from './grep.js'
import { executeManageKanban, formatManageKanbanResult } from './manage_kanban.js'
import { executeManageMemory, executeSearchMemory, formatManageMemoryResult, formatSearchMemoryResult } from './manage_memory.js'
import {
  executePlanExit,
  executeReadPlan,
  executeWritePlan,
  formatPlanExitResult,
  formatReadPlanResult,
  formatWritePlanResult,
} from './manage_plans.js'
import { executeManageTodos, formatManageTodosResult } from './manage_todos.js'
import { executeReadFile, formatReadResult } from './read.js'
import { executeSkill, formatSkillResult } from './skill.js'
import { executeStrReplace, formatStrReplaceResult } from './str-replace.js'
import { executeTree, formatTreeResult } from './tree.js'
import { executeWriteFile, formatWriteResult } from './write.js'

function requireCodingSpace(toolName: string, space?: 'chat' | 'coding') {
  if (space !== 'coding') {
    throw new Error(`Tool "${toolName}" is only available in coding space`)
  }
}

/**
 * Raw executor for each built-in tool. Shared as the single source of truth.
 * Each function accepts a narrow args type, but we only ever call them with
 * a single `args` argument via `executeToolCallRaw`, so the wrapper
 * normalises the signature to `ToolExecutor`.
 */
const rawExecutors: Partial<Record<ToolName, ToolExecutor>> = {
  bash: args => executeBash(args as Parameters<typeof executeBash>[0]),
  read_file: args => executeReadFile(args as Parameters<typeof executeReadFile>[0]),
  glob: args => executeGlob(args as Parameters<typeof executeGlob>[0]),
  grep: args => executeGrep(args as Parameters<typeof executeGrep>[0]),
  tree: args => executeTree(args as Parameters<typeof executeTree>[0]),
  str_replace: args => executeStrReplace(args as Parameters<typeof executeStrReplace>[0]),
  write_file: args => executeWriteFile(args as Parameters<typeof executeWriteFile>[0]),
  manage_memory: args => executeManageMemory(args as Parameters<typeof executeManageMemory>[0]),
  search_memory: args => executeSearchMemory(args as Parameters<typeof executeSearchMemory>[0]),
  skill: args => executeSkill(args as Parameters<typeof executeSkill>[0]),
  manage_todos: args => executeManageTodos(args as Parameters<typeof executeManageTodos>[0]),
  manage_kanban: args => executeManageKanban(args as Parameters<typeof executeManageKanban>[0]),
  write_plan: args => executeWritePlan(args as Parameters<typeof executeWritePlan>[0]),
  read_plan: args => executeReadPlan(args as Parameters<typeof executeReadPlan>[0]),
  plan_exit: () => executePlanExit(),
}

/**
 * Formatted (streaming-aware) executors with context/callback wiring.
 * Only tools that need custom formatting or context handling are listed here;
 * the rest are auto-generated from rawExecutors below.
 */
const formattedOverrides: Partial<Record<ToolName, StreamingToolExecutor>> = {
  bash: async (args, callbacks, context) => {
    const result = await executeBash(
      {
        ...(args as { command: string, timeout?: number, cwd?: string }),
        cwd: (args as { cwd?: string }).cwd ?? context?.workspaceRoot,
      },
      callbacks?.onOutputDelta
        ? {
            onStdout: chunk => callbacks.onOutputDelta!('stdout', chunk),
            onStderr: chunk => callbacks.onOutputDelta!('stderr', chunk),
          }
        : undefined,
    )
    return formatBashResult(result)
  },
  glob: async (args, _callbacks, context) => {
    const normalizedArgs = args as Parameters<typeof executeGlob>[0]
    const result = await executeGlob({
      ...normalizedArgs,
      cwd: normalizedArgs.cwd ?? context?.workspaceRoot,
    })
    return formatGlobResult(result)
  },
  grep: async (args, _callbacks, context) => {
    const normalizedArgs = args as Parameters<typeof executeGrep>[0]
    const result = await executeGrep({
      ...normalizedArgs,
      path: normalizedArgs.path ?? context?.workspaceRoot,
    })
    return formatGrepResult(result)
  },
  manage_memory: async (args, _callbacks, context) => {
    // Only apply workspace scope in coding space; chat space memories are always global
    const workspacePath = context?.space === 'coding' ? context?.workspaceRoot : undefined
    const result = await executeManageMemory(
      args as Parameters<typeof executeManageMemory>[0],
      context?.conversationId,
      workspacePath,
    )
    return formatManageMemoryResult(result)
  },
  skill: async (args, _callbacks, context) => {
    const result = await executeSkill(args as Parameters<typeof executeSkill>[0], context?.skillsWorkspaceRoot)
    return formatSkillResult(result)
  },
  manage_todos: async (args, _callbacks, context) => {
    const result = await executeManageTodos(args as Parameters<typeof executeManageTodos>[0], context?.conversationId)
    return formatManageTodosResult(result)
  },
  manage_kanban: async (args, _callbacks, context) => {
    requireCodingSpace('manage_kanban', context?.space)
    const result = await executeManageKanban(
      args as Parameters<typeof executeManageKanban>[0],
      { conversationId: context?.conversationId, projectKey: context?.projectKey },
    )
    return formatManageKanbanResult(result)
  },
  write_plan: async (args, _callbacks, context) => {
    requireCodingSpace('write_plan', context?.space)
    const result = await executeWritePlan(
      args as Parameters<typeof executeWritePlan>[0],
      { projectKey: context?.projectKey },
    )
    return formatWritePlanResult(result)
  },
  read_plan: async (args, _callbacks, context) => {
    requireCodingSpace('read_plan', context?.space)
    const result = await executeReadPlan(
      args as Parameters<typeof executeReadPlan>[0],
      { projectKey: context?.projectKey },
    )
    return formatReadPlanResult(result)
  },
  plan_exit: async (_args, _callbacks, context) => {
    requireCodingSpace('plan_exit', context?.space)
    const result = await executePlanExit()
    return formatPlanExitResult(result)
  },
}

/** Mapping from tool name to its format function for simple execute→format tools. */
const simpleFormatters: Partial<Record<ToolName, (result: any) => string>> = {
  read_file: formatReadResult,
  tree: formatTreeResult,
  str_replace: formatStrReplaceResult,
  write_file: formatWriteResult,
  search_memory: formatSearchMemoryResult,
}

/** Build the full formatted executors map: overrides + auto-generated simple wrappers. */
const builtinFormattedExecutors: Partial<Record<ToolName, StreamingToolExecutor>> = { ...formattedOverrides }
for (const [name, formatter] of Object.entries(simpleFormatters)) {
  const toolName = name as ToolName
  const rawFn = rawExecutors[toolName]
  if (rawFn && !builtinFormattedExecutors[toolName]) {
    builtinFormattedExecutors[toolName] = async (args) => {
      const result = await rawFn(args)
      return formatter!(result)
    }
  }
}

const builtinRawExecutors = rawExecutors

export function getBuiltinFormattedExecutor(toolName: string): StreamingToolExecutor | undefined {
  return builtinFormattedExecutors[toolName as ToolName]
}

export function getBuiltinRawExecutor(toolName: string): ToolExecutor | undefined {
  return builtinRawExecutors[toolName as ToolName]
}

export function hasBuiltinFormattedExecutor(toolName: string): boolean {
  return toolName in builtinFormattedExecutors
}
