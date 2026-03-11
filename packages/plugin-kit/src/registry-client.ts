import type { PluginPermissions } from '@univedge/locus-agent-sdk'

/**
 * Placeholder interface for a future plugin marketplace/registry.
 *
 * For v1, plugins are installed manually via npm package names
 * or local file paths. This interface reserves the design surface
 * for a future implementation.
 */
export interface RegistryClient {
  /** Search the registry for plugins matching a query */
  search: (query: string, options?: {
    limit?: number
    offset?: number
    category?: string
  }) => Promise<RegistrySearchResult>

  /** Get full metadata for a specific plugin by registry ID */
  getPlugin: (registryId: string) => Promise<RegistryPluginInfo | null>

  /**
   * Resolve the npm package name + version for a registry plugin.
   * Used by PluginManager.install() to convert a registry ID
   * into an installable npm source.
   */
  resolve: (registryId: string, versionRange?: string) => Promise<RegistryResolveResult>
}

export interface RegistrySearchResult {
  total: number
  items: RegistryPluginSummary[]
}

export interface RegistryPluginSummary {
  registryId: string
  name: string
  description: string
  author: string
  latestVersion: string
  downloads: number
  tags: string[]
}

export interface RegistryPluginInfo extends RegistryPluginSummary {
  versions: string[]
  homepage?: string
  repository?: string
  license?: string
  permissions: PluginPermissions
}

export interface RegistryResolveResult {
  npmPackage: string
  version: string
  integrity?: string
}
