import type { HookEventName } from '../hooks/events.js'
import type { PluginPermissions } from './permissions.js'

export interface PluginManifest {
  /** Reverse-domain plugin identifier, e.g. "com.example.git-guardian" */
  id: string
  /** Human-readable name */
  name: string
  /** SemVer version */
  version: string
  /** SDK API version this plugin targets */
  apiVersion: string
  display?: {
    description: string
    author?: string
    homepage?: string
  }
  entry: {
    /** Path to the runtime entry module (relative to manifest) */
    runtime: string
  }
  hooks: Array<{
    event: HookEventName
    /** Exported handler function name in the entry module */
    handler: string
  }>
  permissions: PluginPermissions
  ui?: {
    settings?: boolean
    panels?: string[]
  }
}
