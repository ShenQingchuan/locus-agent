import type { DelegateDelta } from '../types/sse-events.js'
import type { TokenUsage } from './agent-loop.js'

export interface SubAgentConfig {
  name: string
  systemPrompt: string
  model?: unknown
  tools?: string[]
  maxIterations?: number
  thinkingMode?: boolean
}

export interface DelegateArgs {
  agent_name: string
  agent_type: string
  task: string
  context?: string
  system_prompt?: string
  max_iterations?: number
  task_id?: string
  command?: string
}

export interface DelegateResult {
  success: boolean
  taskId: string
  agentName: string
  agentType: string
  result: string
  iterations: number
  usage: TokenUsage
}

export interface DelegateCallbacks {
  onTextDelta?: (delta: string) => void | Promise<void>
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean) => void | Promise<void>
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
  conversationId?: string
}
