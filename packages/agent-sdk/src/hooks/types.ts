import type { HookEventName } from './events.js'

export interface HookScope {
  space: 'chat' | 'coding'
  workspaceRoot?: string
  projectKey?: string
}

export interface HookInvocation<TPayload = unknown> {
  hook: HookEventName
  invocationId: string
  sessionId: string
  runId: string
  scope: HookScope
  actor: {
    pluginId: string
    pluginVersion: string
  }
  payload: TPayload
  capabilities: string[]
  deadlineMs: number
}

// ── HookDecision ─────────────────────────────────────────────

export interface ContextItem {
  kind: 'text' | 'file' | 'snippet'
  content: string
  metadata?: Record<string, unknown>
}

export interface PromptPatch {
  sectionId: string
  action: 'append' | 'prepend' | 'replace' | 'remove'
  content?: string
}

export interface SuggestionItem {
  label: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface PluginArtifact {
  kind: string
  name: string
  content: string
  metadata?: Record<string, unknown>
}

export type HookDecision
  = | { type: 'noop' }
    | { type: 'append_context', items: ContextItem[] }
    | { type: 'patch_prompt', patches: PromptPatch[] }
    | { type: 'suggest', suggestions: SuggestionItem[] }
    | { type: 'require_confirmation', reason: string }
    | { type: 'block', reason: string, code?: string }
    | { type: 'emit_artifact', artifact: PluginArtifact }
