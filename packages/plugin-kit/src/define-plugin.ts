import type {
  HookEventName,
  HookHandler,
  HookPayloadMap,
  PluginManifest,
} from '@univedge/locus-agent-sdk'
import type { PluginDefinition } from './types.js'

interface DefinePluginInput {
  manifest: PluginManifest
  handlers?: Partial<{
    [E in HookEventName]: HookHandler<HookPayloadMap[E]>
  }>
  activate?: () => Promise<void> | void
  deactivate?: () => Promise<void> | void
}

/**
 * Type-safe factory for plugin authors.
 *
 * Usage:
 * ```ts
 * import { definePlugin } from '@univedge/locus-plugin-kit'
 *
 * export default definePlugin({
 *   manifest: { id: 'com.example.my-plugin', ... },
 *   handlers: {
 *     'tool:before_execute': async (invocation) => { ... },
 *   },
 * })
 * ```
 */
export function definePlugin(input: DefinePluginInput): PluginDefinition {
  // Runtime validation: ensure every hook declared in manifest has a handler
  if (input.manifest.hooks && input.handlers) {
    for (const hookDecl of input.manifest.hooks) {
      if (!(hookDecl.event in input.handlers)) {
        console.warn(
          `[plugin-kit] Plugin "${input.manifest.id}" declares hook "${hookDecl.event}" `
          + `but no handler was provided. It will be ignored.`,
        )
      }
    }
  }

  return {
    manifest: input.manifest,
    handlers: input.handlers ?? {},
    activate: input.activate,
    deactivate: input.deactivate,
  }
}
