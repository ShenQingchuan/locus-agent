import type { PluginRecord, PluginStore } from '@locus-agent/plugin-kit'
import type { PermissionScope, PluginScope } from '@locus-agent/agent-sdk'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { plugins } from '../../db/schema.js'

/**
 * Concrete PluginStore implementation backed by SQLite/drizzle.
 */
export function createPluginStoreImpl(): PluginStore {
  function rowToRecord(row: typeof plugins.$inferSelect): PluginRecord {
    return {
      id: row.id,
      source: row.source,
      sourceType: row.sourceType as 'npm' | 'local',
      version: row.version,
      scope: row.scope as PluginScope,
      scopeQualifier: row.scopeQualifier ?? undefined,
      enabled: row.enabled,
      grantedPermissions: (row.grantedPermissions ?? []) as PermissionScope[],
      config: row.config ?? undefined,
      installedAt: row.installedAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }
  }

  return {
    listAll(): PluginRecord[] {
      const rows = db.select().from(plugins).all()
      return rows.map(rowToRecord)
    },

    listEnabled(): PluginRecord[] {
      const rows = db
        .select()
        .from(plugins)
        .where(eq(plugins.enabled, true))
        .all()
      return rows.map(rowToRecord)
    },

    get(pluginId: string): PluginRecord | undefined {
      const rows = db
        .select()
        .from(plugins)
        .where(eq(plugins.id, pluginId))
        .limit(1)
        .all()
      return rows[0] ? rowToRecord(rows[0]) : undefined
    },

    upsert(record: PluginRecord): void {
      const existing = db
        .select({ id: plugins.id })
        .from(plugins)
        .where(eq(plugins.id, record.id))
        .limit(1)
        .all()

      if (existing.length > 0) {
        db.update(plugins)
          .set({
            source: record.source,
            sourceType: record.sourceType,
            version: record.version,
            scope: record.scope,
            scopeQualifier: record.scopeQualifier ?? null,
            enabled: record.enabled,
            grantedPermissions: record.grantedPermissions,
            config: record.config ?? null,
            updatedAt: new Date(record.updatedAt),
          })
          .where(eq(plugins.id, record.id))
          .run()
      }
      else {
        db.insert(plugins)
          .values({
            id: record.id,
            source: record.source,
            sourceType: record.sourceType,
            version: record.version,
            scope: record.scope,
            scopeQualifier: record.scopeQualifier ?? null,
            enabled: record.enabled,
            grantedPermissions: record.grantedPermissions,
            config: record.config ?? null,
            installedAt: new Date(record.installedAt),
            updatedAt: new Date(record.updatedAt),
          })
          .run()
      }
    },

    remove(pluginId: string): void {
      db.delete(plugins)
        .where(eq(plugins.id, pluginId))
        .run()
    },

    setEnabled(pluginId: string, enabled: boolean): void {
      db.update(plugins)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(plugins.id, pluginId))
        .run()
    },
  }
}
