/**
 * Canonical enum-like objects for hook event names and categories.
 *
 * Use `HookEvent.ToolBeforeExecute` instead of `'tool:before_execute'`.
 */

// ── Hook Event Names ────────────────────────────────────────

export const HookEvent = {
  // Session lifecycle
  SessionStart: 'session:start',
  SessionEnd: 'session:end',
  // Message
  MessageUserReceived: 'message:user_received',
  // Context & Prompt
  ContextResolve: 'context:resolve',
  PromptAssemble: 'prompt:assemble',
  // Model
  ModelBeforeCall: 'model:before_call',
  ModelAfterCall: 'model:after_call',
  // Tool
  ToolBeforeExecute: 'tool:before_execute',
  ToolApprovalRequired: 'tool:approval_required',
  ToolAfterExecute: 'tool:after_execute',
  // Delegate
  DelegateBeforeRun: 'delegate:before_run',
  DelegateAfterRun: 'delegate:after_run',
  // Artifact
  ArtifactPlanWritten: 'artifact:plan_written',
  ArtifactFileChangeDetected: 'artifact:file_change_detected',
  // Run
  RunFinish: 'run:finish',
  RunError: 'run:error',
} as const

export type HookEventName = typeof HookEvent[keyof typeof HookEvent]

// ── Hook Category ───────────────────────────────────────────

/**
 * Hook capability category.
 *
 * - observe: read-only, cannot alter the main flow
 * - enrich:  may append context, tags, suggestions, metadata
 * - guard:   may block, require confirmation, downgrade, or replace strategy
 */
export const HookKind = {
  Observe: 'observe',
  Enrich: 'enrich',
  Guard: 'guard',
} as const

export type HookCategory = typeof HookKind[keyof typeof HookKind]

// ── Category mapping ────────────────────────────────────────

export const HOOK_CATEGORIES: Record<HookEventName, HookCategory> = {
  [HookEvent.SessionStart]: HookKind.Observe,
  [HookEvent.SessionEnd]: HookKind.Observe,
  [HookEvent.MessageUserReceived]: HookKind.Observe,
  [HookEvent.ContextResolve]: HookKind.Enrich,
  [HookEvent.PromptAssemble]: HookKind.Enrich,
  [HookEvent.ModelBeforeCall]: HookKind.Guard,
  [HookEvent.ModelAfterCall]: HookKind.Enrich,
  [HookEvent.ToolBeforeExecute]: HookKind.Guard,
  [HookEvent.ToolApprovalRequired]: HookKind.Observe,
  [HookEvent.ToolAfterExecute]: HookKind.Enrich,
  [HookEvent.DelegateBeforeRun]: HookKind.Guard,
  [HookEvent.DelegateAfterRun]: HookKind.Enrich,
  [HookEvent.ArtifactPlanWritten]: HookKind.Observe,
  [HookEvent.ArtifactFileChangeDetected]: HookKind.Observe,
  [HookEvent.RunFinish]: HookKind.Observe,
  [HookEvent.RunError]: HookKind.Observe,
}
