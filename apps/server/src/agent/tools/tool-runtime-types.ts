export interface ToolOutputCallbacks {
  onOutputDelta?: (stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
}

export interface ToolExecutionContext {
  conversationId?: string
  projectKey?: string
  workspaceRoot?: string
}

export type ToolExecutor<T = unknown, R = unknown> = (args: T) => Promise<R>
export type StreamingToolExecutor<T = unknown, R = unknown> = (
  args: T,
  callbacks?: ToolOutputCallbacks,
  context?: ToolExecutionContext,
) => Promise<R>
