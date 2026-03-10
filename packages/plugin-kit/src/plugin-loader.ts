import { resolve } from 'node:path'
import type { PluginDefinition } from './types.js'

/**
 * Resolves and dynamically imports a plugin module.
 *
 * - npm packages: import(packageName) via Node module resolution
 * - Local paths: resolve to file:// URL for ESM import
 *
 * In both cases, the module's default export must be a PluginDefinition
 * (as returned by definePlugin()).
 */
export class PluginLoader {
  async load(source: string, sourceType: 'npm' | 'local'): Promise<PluginDefinition> {
    const specifier = sourceType === 'local'
      ? `file://${resolve(source)}`
      : source

    let mod: unknown
    try {
      mod = await import(specifier)
    }
    catch (err) {
      throw new Error(
        `Failed to import plugin from "${specifier}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    const definition = this.extractDefinition(mod)
    this.validateDefinition(definition, source)
    return definition
  }

  private extractDefinition(mod: unknown): PluginDefinition {
    // Support both `export default definePlugin(...)` and `module.exports = definePlugin(...)`
    if (mod && typeof mod === 'object' && 'default' in mod) {
      return (mod as { default: PluginDefinition }).default
    }
    // If the module itself looks like a PluginDefinition
    if (mod && typeof mod === 'object' && 'manifest' in mod) {
      return mod as PluginDefinition
    }
    throw new Error('Plugin module must export a PluginDefinition as default export')
  }

  private validateDefinition(definition: PluginDefinition, source: string): void {
    if (!definition.manifest) {
      throw new Error(`Plugin from "${source}" has no manifest`)
    }
    if (!definition.manifest.id || typeof definition.manifest.id !== 'string') {
      throw new Error(`Plugin from "${source}" has invalid manifest.id`)
    }
    if (!definition.manifest.version) {
      throw new Error(`Plugin from "${source}" has no manifest.version`)
    }
  }
}
