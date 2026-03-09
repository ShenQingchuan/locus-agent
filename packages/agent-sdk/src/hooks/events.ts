/**
 * All lifecycle hook event names in the Agent Runtime Pipeline.
 *
 * Grouped by domain:
 *   session  – conversation-level lifecycle
 *   message  – user input
 *   context  – context resolution & prompt assembly
 *   model    – LLM call boundaries
 *   tool     – tool execution boundaries
 *   delegate – sub-agent boundaries
 *   artifact – plan / file-change observations
 *   run      – agent loop lifecycle
 */
export type HookEventName
  // Session lifecycle
  = | 'session:start'
    | 'session:end'
  // Message
    | 'message:user_received'
  // Context & Prompt
    | 'context:resolve'
    | 'prompt:assemble'
  // Model
    | 'model:before_call'
    | 'model:after_call'
  // Tool
    | 'tool:before_execute'
    | 'tool:approval_required'
    | 'tool:after_execute'
  // Delegate
    | 'delegate:before_run'
    | 'delegate:after_run'
  // Artifact
    | 'artifact:plan_written'
    | 'artifact:file_change_detected'
  // Run
    | 'run:finish'
    | 'run:error'

/**
 * Hook capability category.
 *
 * - observe: read-only, cannot alter the main flow
 * - enrich:  may append context, tags, suggestions, metadata
 * - guard:   may block, require confirmation, downgrade, or replace strategy
 */
export type HookCategory = 'observe' | 'enrich' | 'guard'

export const HOOK_CATEGORIES: Record<HookEventName, HookCategory> = {
  'session:start': 'observe',
  'session:end': 'observe',
  'message:user_received': 'observe',
  'context:resolve': 'enrich',
  'prompt:assemble': 'enrich',
  'model:before_call': 'guard',
  'model:after_call': 'enrich',
  'tool:before_execute': 'guard',
  'tool:approval_required': 'observe',
  'tool:after_execute': 'enrich',
  'delegate:before_run': 'guard',
  'delegate:after_run': 'enrich',
  'artifact:plan_written': 'observe',
  'artifact:file_change_detected': 'observe',
  'run:finish': 'observe',
  'run:error': 'observe',
}
