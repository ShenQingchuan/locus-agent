import type { MCPServersConfig, MCPServerStatus } from '@locus-agent/shared'

export interface MCPStatusChangeEvent {
  name: string
  status: 'connected' | 'connecting' | 'error' | 'disconnected'
  error?: string
  tools: string[]
  disabled: boolean
}

export async function fetchMCPConfig(): Promise<MCPServersConfig | null> {
  try {
    const response = await fetch('/api/mcp/config')
    if (!response.ok)
      return null
    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch MCP config:', error)
    return null
  }
}

export async function updateMCPConfig(
  config: MCPServersConfig,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const response = await fetch('/api/mcp/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const json = await response.json().catch(() => null) as any
    if (!response.ok || json?.success === false) {
      return { success: false, message: json?.message || 'Failed to update MCP config' }
    }
    return { success: true, status: json?.status }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function fetchMCPStatus(): Promise<MCPServerStatus[]> {
  try {
    const response = await fetch('/api/mcp/status')
    if (!response.ok)
      return []
    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch MCP status:', error)
    return []
  }
}

export async function fetchMCPLogs(limit = 1000): Promise<string[]> {
  try {
    const safeLimit = Math.max(1, Math.min(limit, 1000))
    const response = await fetch(`/api/mcp/logs?limit=${safeLimit}`)
    if (!response.ok)
      return []
    const json = await response.json().catch(() => null) as { lines?: string[] } | null
    if (!json?.lines || !Array.isArray(json.lines))
      return []
    return json.lines
  }
  catch (error) {
    console.error('Failed to fetch MCP logs:', error)
    return []
  }
}

export async function restartMCPServer(
  name?: string,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const url = name ? `/api/mcp/restart/${encodeURIComponent(name)}` : '/api/mcp/restart'
    const response = await fetch(url, { method: 'POST' })
    const json = await response.json().catch(() => null) as any
    if (!response.ok || json?.success === false) {
      return { success: false, message: json?.message || 'Failed to restart MCP server' }
    }
    return { success: true, status: json?.status }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export function subscribeMCPStatus(
  onInit: (status: MCPServerStatus[]) => void,
  onChange: (event: MCPStatusChangeEvent) => void,
): () => void {
  const eventSource = new EventSource('/api/mcp/events')

  eventSource.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data) as MCPServerStatus[]
      onInit(data)
    }
    catch {
      // ignore parse error
    }
  })

  eventSource.addEventListener('statusChange', (e) => {
    try {
      const data = JSON.parse(e.data) as MCPStatusChangeEvent
      onChange(data)
    }
    catch {
      // ignore parse error
    }
  })

  eventSource.addEventListener('error', () => {
    // SSE auto-reconnects
  })

  return () => {
    eventSource.close()
  }
}
