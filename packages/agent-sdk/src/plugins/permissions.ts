/**
 * Fine-grained permission scope strings.
 *
 * Template literal types allow patterns like `tools.invoke:bash`
 * or `network.domain:api.example.com`.
 */
export type PermissionScope
  = | 'workspace.read'
    | 'workspace.write'
    | 'network.fetch'
    | `network.domain:${string}`
    | `tools.invoke:${string}`
    | 'session.read'
    | 'session.write_annotations'
    | 'prompt.patch'
    | 'model.block'
    | 'ui.render_panel'

/**
 * Permissions declared in a plugin manifest.
 * Each category lists the specific capabilities the plugin requires.
 */
export interface PluginPermissions {
  workspace?: ('read' | 'write')[]
  network?: string[]
  tools?: string[]
  session?: string[]
}

/**
 * Check whether a set of granted permissions satisfies a requested scope.
 */
export function hasPermission(
  granted: PermissionScope[],
  requested: PermissionScope,
): boolean {
  return granted.includes(requested)
}
