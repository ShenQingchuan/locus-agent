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
