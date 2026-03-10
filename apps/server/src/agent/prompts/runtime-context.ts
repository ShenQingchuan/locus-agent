import process from 'node:process'

export function buildRuntimeContextPrompt(workspaceRoot: string): string {
  return `## Runtime Context

- workspace_root: ${workspaceRoot}
- server_cwd: ${process.cwd()}
- Prefer resolving relative paths from workspace_root.
- Before broad discovery, use tree with limited depth to inspect structure.`
}
