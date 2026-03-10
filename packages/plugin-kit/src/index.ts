// Define plugin (for plugin authors)
export { definePlugin } from './define-plugin.js'

// Runtime (for server integration)
export { HookBusImpl } from './hook-bus-impl.js'
export { PluginLoader } from './plugin-loader.js'
export { PluginManager } from './plugin-manager.js'

// Decision processing utility
export { processDecisions } from './process-decisions.js'
export type { ProcessedDecisions } from './process-decisions.js'

// Types
export type { PluginStore } from './plugin-store.js'
export type {
  InstallOptions,
  PluginDefinition,
  PluginInstance,
  PluginRecord,
  PluginState,
} from './types.js'

// Registry placeholder
export type {
  RegistryClient,
  RegistryPluginInfo,
  RegistryPluginSummary,
  RegistryResolveResult,
  RegistrySearchResult,
} from './registry-client.js'
