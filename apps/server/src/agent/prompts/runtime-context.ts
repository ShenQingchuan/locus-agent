import process from 'node:process'

export function buildRuntimeContextPrompt(workspaceRoot: string): string {
  const now = new Date()
  const currentDatetime = now.toLocaleString('en-US', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return `## Runtime Context

- current_datetime: ${currentDatetime}
- workspace_root: ${workspaceRoot}
- server_cwd: ${process.cwd()}
- Prefer resolving relative paths from workspace_root.
- Before broad discovery, use tree with limited depth to inspect structure.`
}
