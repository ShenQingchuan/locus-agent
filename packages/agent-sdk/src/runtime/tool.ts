/**
 * Canonical names for all built-in tools.
 *
 * Use these constants instead of string literals when referencing tool names
 * across the codebase (policy checks, pipeline branching, allowlists, etc.).
 */
export const BuiltinTool = {
  Bash: 'bash',
  ReadFile: 'read_file',
  Glob: 'glob',
  Grep: 'grep',
  Tree: 'tree',
  StrReplace: 'str_replace',
  WriteFile: 'write_file',
  AskQuestion: 'ask_question',
  Delegate: 'delegate',
  SaveMemory: 'save_memory',
  SearchMemories: 'search_memories',
  Skill: 'skill',
  ManageTodos: 'manage_todos',
  ManageKanban: 'manage_kanban',
  WritePlan: 'write_plan',
  ReadPlan: 'read_plan',
  PlanExit: 'plan_exit',
} as const

export type BuiltinToolName = typeof BuiltinTool[keyof typeof BuiltinTool]

export interface ToolExecutionContext {
  conversationId?: string
  projectKey?: string
  workspaceRoot?: string
  skillsWorkspaceRoot?: string
}

export interface ToolOutputCallbacks {
  onOutputDelta?: (stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
}

export type ToolExecutor<TArgs = unknown, TResult = unknown>
  = (args: TArgs) => Promise<TResult>

export type StreamingToolExecutor<TArgs = unknown, TResult = unknown>
  = (args: TArgs, callbacks?: ToolOutputCallbacks, context?: ToolExecutionContext) => Promise<TResult>
