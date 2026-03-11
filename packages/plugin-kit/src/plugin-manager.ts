import type { HookEventName } from '@univedge/locus-agent-sdk'
import type { HookBusImpl } from './hook-bus-impl.js'
import type { PluginLoader } from './plugin-loader.js'
import type { PluginStore } from './plugin-store.js'
import type { InstallOptions, PluginDefinition, PluginInstance, PluginRecord } from './types.js'

/**
 * PluginManager orchestrates the full plugin lifecycle:
 * install, activate, deactivate, uninstall.
 *
 * It coordinates between PluginStore (persistence), PluginLoader (module loading),
 * and HookBusImpl (event dispatch).
 */
export class PluginManager {
  private plugins = new Map<string, PluginInstance>()

  constructor(
    private store: PluginStore,
    private loader: PluginLoader,
    private hookBus: HookBusImpl,
  ) {}

  // ─── Lifecycle Methods ────────────────────────────────────

  /**
   * Called once at server startup.
   * Loads all enabled plugin records from the store and activates them.
   */
  async initialize(): Promise<void> {
    const records = this.store.listEnabled()
    for (const record of records) {
      try {
        await this.loadAndActivate(record)
      }
      catch (err) {
        console.error(`[plugin-manager] Failed to initialize plugin "${record.id}":`, err)
        this.plugins.set(record.id, {
          manifest: {
            id: record.id,
            name: record.id,
            version: record.version,
            apiVersion: '1',
            entry: { runtime: '' },
            hooks: [],
            permissions: {},
          },
          state: 'error',
          error: err instanceof Error ? err.message : String(err),
          handlers: new Map(),
        })
      }
    }
  }

  /**
   * Install a plugin from npm or local path.
   */
  async install(options: InstallOptions): Promise<PluginInstance> {
    // 1. Load the plugin definition from source
    const definition = await this.loader.load(options.source, options.sourceType)

    // 2. Check for duplicate
    if (this.plugins.has(definition.manifest.id)) {
      throw new Error(`Plugin "${definition.manifest.id}" is already installed`)
    }

    // 3. Persist the record
    const record: PluginRecord = {
      id: definition.manifest.id,
      source: options.source,
      sourceType: options.sourceType,
      version: definition.manifest.version,
      scope: options.scope ?? 'global',
      scopeQualifier: options.scopeQualifier,
      enabled: true,
      grantedPermissions: options.grantPermissions ?? [],
      installedAt: Date.now(),
      updatedAt: Date.now(),
    }
    this.store.upsert(record)

    // 4. Activate
    return this.activateFromDefinition(definition, record)
  }

  /**
   * Deactivate a plugin (unsubscribe hooks, call deactivate()).
   * Does NOT remove from store -- plugin remains installed but inactive.
   */
  async deactivate(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance)
      return

    // Unsubscribe all handlers from HookBus
    this.hookBus.unsubscribePlugin(pluginId)

    // Call plugin's deactivate lifecycle hook
    if (instance.deactivate) {
      try {
        await instance.deactivate()
      }
      catch (err) {
        console.warn(`[plugin-manager] deactivate() failed for "${pluginId}":`, err)
      }
    }

    instance.state = 'inactive'
    this.store.setEnabled(pluginId, false)
  }

  /**
   * Re-activate a previously deactivated plugin.
   */
  async activate(pluginId: string): Promise<void> {
    const record = this.store.get(pluginId)
    if (!record)
      throw new Error(`Plugin "${pluginId}" not found in store`)
    await this.loadAndActivate(record)
    this.store.setEnabled(pluginId, true)
  }

  /**
   * Fully uninstall: deactivate, remove from store, remove from memory.
   */
  async uninstall(pluginId: string): Promise<void> {
    await this.deactivate(pluginId)
    this.store.remove(pluginId)
    this.plugins.delete(pluginId)
  }

  // ─── Query Methods ────────────────────────────────────────

  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  listPlugins(): PluginInstance[] {
    return [...this.plugins.values()]
  }

  listRecords(): PluginRecord[] {
    return this.store.listAll()
  }

  // ─── Internal ─────────────────────────────────────────────

  private async loadAndActivate(record: PluginRecord): Promise<PluginInstance> {
    const definition = await this.loader.load(record.source, record.sourceType)
    return this.activateFromDefinition(definition, record)
  }

  private async activateFromDefinition(
    definition: PluginDefinition,
    record: PluginRecord,
  ): Promise<PluginInstance> {
    const instance: PluginInstance = {
      manifest: definition.manifest,
      state: 'active',
      handlers: new Map(),
      activate: definition.activate,
      deactivate: definition.deactivate,
    }

    // Bind handlers to HookBus
    for (const [event, handler] of Object.entries(definition.handlers)) {
      if (handler) {
        const eventName = event as HookEventName
        instance.handlers.set(eventName, handler)
        this.hookBus.subscribePlugin(
          definition.manifest.id,
          definition.manifest.version,
          eventName,
          handler,
          record.grantedPermissions,
        )
      }
    }

    // Call plugin's activate lifecycle hook
    if (definition.activate) {
      try {
        await definition.activate()
      }
      catch (err) {
        instance.state = 'error'
        instance.error = err instanceof Error ? err.message : String(err)
        console.error(`[plugin-manager] activate() failed for "${definition.manifest.id}":`, err)
      }
    }

    this.plugins.set(definition.manifest.id, instance)
    return instance
  }
}
