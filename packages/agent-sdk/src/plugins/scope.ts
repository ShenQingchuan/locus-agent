/**
 * Scope at which a plugin can be enabled.
 *
 * - global:       applies to all sessions across all workspaces
 * - workspace:    applies to sessions within a specific workspace
 * - project:      applies to a specific project within a workspace
 * - conversation: applies to a single conversation
 */
export type PluginScope = 'global' | 'workspace' | 'project' | 'conversation'

/**
 * Ordering of scopes from broadest to narrowest.
 * Useful for precedence resolution.
 */
export const PLUGIN_SCOPE_ORDER: readonly PluginScope[] = [
  'global',
  'workspace',
  'project',
  'conversation',
] as const
