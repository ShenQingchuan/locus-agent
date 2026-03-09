import type { TokenUsage } from '../runtime/agent-loop.js'
import type { ToolCategory } from '../runtime/tool-policy.js'

// ── Session ──────────────────────────────────────────────────

export interface SessionStartPayload {
  conversationId: string
  space: 'chat' | 'coding'
  codingMode?: 'build' | 'plan'
}

export interface SessionEndPayload {
  conversationId: string
  durationMs: number
}

// ── Message ──────────────────────────────────────────────────

export interface MessageUserReceivedPayload {
  conversationId: string
  content: string
  hasAttachments: boolean
}

// ── Context & Prompt ─────────────────────────────────────────

export interface ContextResolvePayload {
  workspaceRoot?: string
  skillNames: string[]
}

export interface PromptAssemblePayload {
  sections: Array<{ id: string, content: string }>
}

// ── Model ────────────────────────────────────────────────────

export interface ModelBeforeCallPayload {
  systemPrompt: string
  messageCount: number
  iteration: number
  toolCount: number
}

export interface ModelAfterCallPayload {
  finishReason: string
  usage: TokenUsage
  toolCallCount: number
  textLength: number
}

// ── Tool ─────────────────────────────────────────────────────

export interface ToolBeforeExecutePayload {
  toolName: string
  toolCallId: string
  args: unknown
  toolCategory: ToolCategory
}

export interface ToolApprovalRequiredPayload {
  toolName: string
  toolCallId: string
  args: unknown
}

export interface ToolAfterExecutePayload {
  toolName: string
  toolCallId: string
  resultLength: number
  isError: boolean
  durationMs: number
}

// ── Delegate ─────────────────────────────────────────────────

export interface DelegateBeforeRunPayload {
  agentName: string
  agentType: string
  task: string
  taskId: string
}

export interface DelegateAfterRunPayload {
  agentName: string
  agentType: string
  taskId: string
  success: boolean
  iterations: number
  usage: TokenUsage
}

// ── Artifact ─────────────────────────────────────────────────

export interface ArtifactPlanWrittenPayload {
  planPath: string
  projectKey?: string
}

export interface ArtifactFileChangeDetectedPayload {
  filePath: string
  changeType: 'created' | 'modified' | 'deleted'
  toolName: string
}

// ── Run ──────────────────────────────────────────────────────

export interface RunFinishPayload {
  finishReason: string
  usage: TokenUsage
  iterations: number
  toolCallCount: number
}

export interface RunErrorPayload {
  error: string
  iteration: number
}

// ── Payload map for type-safe dispatch ───────────────────────

export interface HookPayloadMap {
  'session:start': SessionStartPayload
  'session:end': SessionEndPayload
  'message:user_received': MessageUserReceivedPayload
  'context:resolve': ContextResolvePayload
  'prompt:assemble': PromptAssemblePayload
  'model:before_call': ModelBeforeCallPayload
  'model:after_call': ModelAfterCallPayload
  'tool:before_execute': ToolBeforeExecutePayload
  'tool:approval_required': ToolApprovalRequiredPayload
  'tool:after_execute': ToolAfterExecutePayload
  'delegate:before_run': DelegateBeforeRunPayload
  'delegate:after_run': DelegateAfterRunPayload
  'artifact:plan_written': ArtifactPlanWrittenPayload
  'artifact:file_change_detected': ArtifactFileChangeDetectedPayload
  'run:finish': RunFinishPayload
  'run:error': RunErrorPayload
}
