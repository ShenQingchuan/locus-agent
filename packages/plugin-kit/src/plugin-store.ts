import type { PluginRecord } from './types.js'

/**
 * Abstract persistence interface for plugin records.
 *
 * The server provides a concrete implementation backed by SQLite/drizzle.
 * plugin-kit stays DB-agnostic by depending only on this interface.
 */
export interface PluginStore {
  /** List all plugin records */
  listAll: () => PluginRecord[]
  /** List only enabled plugin records */
  listEnabled: () => PluginRecord[]
  /** Get a specific plugin record by ID */
  get: (pluginId: string) => PluginRecord | undefined
  /** Insert or update a plugin record */
  upsert: (record: PluginRecord) => void
  /** Remove a plugin record by ID */
  remove: (pluginId: string) => void
  /** Update the enabled state of a plugin */
  setEnabled: (pluginId: string, enabled: boolean) => void
}
