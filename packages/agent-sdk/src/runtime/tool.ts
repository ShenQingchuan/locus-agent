/**
 * Canonical names for all Locus built-in tools.
 *
 * These are Locus's own agent loop tool names (lowercase/snake_case).
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
  ManageMemory: 'manage_memory',
  SearchMemory: 'search_memory',
  Skill: 'skill',
  ManageTodos: 'manage_todos',
  ManageKanban: 'manage_kanban',
  WritePlan: 'write_plan',
  ReadPlan: 'read_plan',
  PlanExit: 'plan_exit',
} as const

export type BuiltinToolName = typeof BuiltinTool[keyof typeof BuiltinTool]

/**
 * Canonical names for Claude Code built-in tools (via ACP / local-claude-code).
 *
 * Claude Code uses PascalCase tool names. Use these constants when handling
 * tool events from the ACP integration (onToolCallStart, onToolCallResult, etc.).
 */
export const ClaudeCodeTool = {
  // File I/O
  Bash: 'Bash',
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  Glob: 'Glob',
  Grep: 'Grep',
  NotebookEdit: 'NotebookEdit',
  // Web
  WebFetch: 'WebFetch',
  WebSearch: 'WebSearch',
  // Agent & Multi-agent
  Agent: 'Agent',
  SendMessage: 'SendMessage',
  TeamCreate: 'TeamCreate',
  TeamDelete: 'TeamDelete',
  // Tasks
  TaskCreate: 'TaskCreate',
  TaskList: 'TaskList',
  TaskUpdate: 'TaskUpdate',
  TaskGet: 'TaskGet',
  TaskStop: 'TaskStop',
  TaskOutput: 'TaskOutput',
  // Worktree
  EnterWorktree: 'EnterWorktree',
  ExitWorktree: 'ExitWorktree',
  // Planning
  EnterPlanMode: 'EnterPlanMode',
  ExitPlanMode: 'ExitPlanMode',
  // User interaction
  AskUserQuestion: 'AskUserQuestion',
  // Discovery
  ToolSearch: 'ToolSearch',
  // MCP Resources
  ListMcpResources: 'ListMcpResources',
  ReadMcpResource: 'ReadMcpResource',
  // Scheduling
  CronCreate: 'CronCreate',
  CronDelete: 'CronDelete',
  CronList: 'CronList',
  RemoteTrigger: 'RemoteTrigger',
  // IDE / LSP
  LSP: 'LSP',
  // Config & Todo
  Config: 'Config',
  TodoWrite: 'TodoWrite',
} as const

export type ClaudeCodeToolName = typeof ClaudeCodeTool[keyof typeof ClaudeCodeTool]

export interface ToolExecutionContext {
  conversationId?: string
  space?: 'chat' | 'coding'
  codingMode?: 'build' | 'plan'
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
