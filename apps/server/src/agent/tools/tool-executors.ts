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

const builtinFormattedExecutors: Partial<Record<ToolName, StreamingToolExecutor>> = {
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
  read_file: async (args) => {
    const result = await executeReadFile(args as { file_path: string, offset?: number, limit?: number })
    return formatReadResult(result)
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
  tree: async (args) => {
    const result = await executeTree(args as Parameters<typeof executeTree>[0])
    return formatTreeResult(result)
  },
  str_replace: async (args) => {
    const result = await executeStrReplace(args as Parameters<typeof executeStrReplace>[0])
    return formatStrReplaceResult(result)
  },
  write_file: async (args) => {
    const result = await executeWriteFile(args as Parameters<typeof executeWriteFile>[0])
    return formatWriteResult(result)
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
  search_memory: async (args) => {
    const result = await executeSearchMemory(
      args as Parameters<typeof executeSearchMemory>[0],
    )
    return formatSearchMemoryResult(result)
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

const builtinRawExecutors: Partial<Record<ToolName, ToolExecutor>> = {
  bash: executeBash as ToolExecutor,
  read_file: executeReadFile as ToolExecutor,
  glob: executeGlob as ToolExecutor,
  grep: executeGrep as ToolExecutor,
  tree: executeTree as ToolExecutor,
  str_replace: executeStrReplace as ToolExecutor,
  write_file: executeWriteFile as ToolExecutor,
  manage_memory: executeManageMemory as ToolExecutor,
  search_memory: executeSearchMemory as ToolExecutor,
  skill: executeSkill as ToolExecutor,
  manage_todos: executeManageTodos as ToolExecutor,
  manage_kanban: executeManageKanban as ToolExecutor,
  write_plan: executeWritePlan as ToolExecutor,
  read_plan: executeReadPlan as ToolExecutor,
  plan_exit: executePlanExit as ToolExecutor,
}

export function getBuiltinFormattedExecutor(toolName: string): StreamingToolExecutor | undefined {
  return builtinFormattedExecutors[toolName as ToolName]
}

export function getBuiltinRawExecutor(toolName: string): ToolExecutor | undefined {
  return builtinRawExecutors[toolName as ToolName]
}

export function hasBuiltinFormattedExecutor(toolName: string): boolean {
  return toolName in builtinFormattedExecutors
}
