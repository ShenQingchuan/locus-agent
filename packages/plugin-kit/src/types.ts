import type {
  HookEventName,
  HookHandler,
  HookPayloadMap,
  PermissionScope,
  PluginManifest,
  PluginScope,
} from '@locus-agent/agent-sdk'

/**
 * Runtime state of a loaded plugin.
 */
export type PluginState = 'installed' | 'active' | 'inactive' | 'error'

/**
 * A resolved, in-memory plugin instance with bound handlers.
 * This is what PluginManager holds after loading + activating.
 */
export interface PluginInstance {
  manifest: PluginManifest
  state: PluginState
  error?: string
  /** Bound hook handlers keyed by event name */
  handlers: Map<HookEventName, HookHandler<any>>
  /** Plugin-provided activate/deactivate lifecycle hooks */
  activate?: () => Promise<void> | void
  deactivate?: () => Promise<void> | void
}

/**
 * The definition object returned by definePlugin().
 * This is what plugin authors export from their entry module.
 */
export interface PluginDefinition {
  manifest: PluginManifest
  handlers: Partial<{
    [E in HookEventName]: HookHandler<HookPayloadMap[E]>
  }>
  activate?: () => Promise<void> | void
  deactivate?: () => Promise<void> | void
}

/**
 * Serializable record for persistence.
 * Stored in the DB to survive server restarts.
 */
export interface PluginRecord {
  /** Plugin manifest id */
  id: string
  /** npm package name OR local file path */
  source: string
  /** Source type */
  sourceType: 'npm' | 'local'
  /** Installed version (from manifest after loading) */
  version: string
  /** The scope at which this plugin is enabled */
  scope: PluginScope
  /** Scope qualifier (e.g. workspace root path, project key, conversation ID) */
  scopeQualifier?: string
  /** Whether the plugin should be active on startup */
  enabled: boolean
  /** Granted permissions (approved by user at install time) */
  grantedPermissions: PermissionScope[]
  /** JSON-serialized plugin-specific config, opaque to the framework */
  config?: string
  installedAt: number
  updatedAt: number
}

/**
 * Options for PluginManager.install()
 */
export interface InstallOptions {
  source: string
  sourceType: 'npm' | 'local'
  scope?: PluginScope
  scopeQualifier?: string
  /** If provided, these permissions are granted without prompting */
  grantPermissions?: PermissionScope[]
}
