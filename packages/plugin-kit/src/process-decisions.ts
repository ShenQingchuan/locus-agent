import type {
  ContextItem,
  HookDecision,
  PluginArtifact,
  PromptPatch,
  SuggestionItem,
} from '@univedge/locus-agent-sdk'

/**
 * Processed result of merging multiple HookDecisions.
 */
export interface ProcessedDecisions {
  /** First block decision wins */
  blocked: { reason: string, code?: string } | null
  /** First require_confirmation decision wins */
  requireConfirmation: { reason: string } | null
  /** Accumulated context items from all append_context decisions */
  contextItems: ContextItem[]
  /** Accumulated prompt patches from all patch_prompt decisions */
  promptPatches: PromptPatch[]
  /** Accumulated suggestions from all suggest decisions */
  suggestions: SuggestionItem[]
  /** Accumulated artifacts from all emit_artifact decisions */
  artifacts: PluginArtifact[]
}

/**
 * Merge a list of HookDecisions into a single structured result.
 *
 * Used by the orchestrator and tool-call-pipeline to process
 * the decisions returned by HookBus.emit().
 */
export function processDecisions(decisions: HookDecision[]): ProcessedDecisions {
  const result: ProcessedDecisions = {
    blocked: null,
    requireConfirmation: null,
    contextItems: [],
    promptPatches: [],
    suggestions: [],
    artifacts: [],
  }

  for (const d of decisions) {
    switch (d.type) {
      case 'block':
        if (!result.blocked)
          result.blocked = { reason: d.reason, code: d.code }
        break
      case 'require_confirmation':
        if (!result.requireConfirmation)
          result.requireConfirmation = { reason: d.reason }
        break
      case 'append_context':
        result.contextItems.push(...d.items)
        break
      case 'patch_prompt':
        result.promptPatches.push(...d.patches)
        break
      case 'suggest':
        result.suggestions.push(...d.suggestions)
        break
      case 'emit_artifact':
        result.artifacts.push(d.artifact)
        break
      case 'noop':
        break
    }
  }

  return result
}
