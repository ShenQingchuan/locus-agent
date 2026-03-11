import { HookBusImpl, PluginLoader, PluginManager } from '@univedge/locus-plugin-kit'
import { createPluginStoreImpl } from './plugin-store-impl.js'

// Singletons
export const hookBus = new HookBusImpl({ deadlineMs: 5000 })
export const pluginLoader = new PluginLoader()
export const pluginStore = createPluginStoreImpl()
export const pluginManager = new PluginManager(pluginStore, pluginLoader, hookBus)
