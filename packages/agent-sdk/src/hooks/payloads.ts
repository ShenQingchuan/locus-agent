import type { TokenUsage } from '../runtime/agent-loop.js'
import type { ToolCategory } from '../runtime/tool-policy.js'
import type { HookEvent } from './events.js'

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
  [HookEvent.SessionStart]: SessionStartPayload
  [HookEvent.SessionEnd]: SessionEndPayload
  [HookEvent.MessageUserReceived]: MessageUserReceivedPayload
  [HookEvent.ContextResolve]: ContextResolvePayload
  [HookEvent.PromptAssemble]: PromptAssemblePayload
  [HookEvent.ModelBeforeCall]: ModelBeforeCallPayload
  [HookEvent.ModelAfterCall]: ModelAfterCallPayload
  [HookEvent.ToolBeforeExecute]: ToolBeforeExecutePayload
  [HookEvent.ToolApprovalRequired]: ToolApprovalRequiredPayload
  [HookEvent.ToolAfterExecute]: ToolAfterExecutePayload
  [HookEvent.DelegateBeforeRun]: DelegateBeforeRunPayload
  [HookEvent.DelegateAfterRun]: DelegateAfterRunPayload
  [HookEvent.ArtifactPlanWritten]: ArtifactPlanWrittenPayload
  [HookEvent.ArtifactFileChangeDetected]: ArtifactFileChangeDetectedPayload
  [HookEvent.RunFinish]: RunFinishPayload
  [HookEvent.RunError]: RunErrorPayload
}
