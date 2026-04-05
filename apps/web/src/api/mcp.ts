import type { MCPServersConfig, MCPServerStatus } from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

export interface MCPStatusChangeEvent {
  name: string
  status: 'connected' | 'connecting' | 'error' | 'disconnected'
  error?: string
  tools: string[]
  disabled: boolean
}

export async function fetchMCPConfig(): Promise<MCPServersConfig | null> {
  try {
    return await apiClient.get<MCPServersConfig>('/api/mcp/config')
  }
  catch {
    return null
  }
}

export async function updateMCPConfig(
  config: MCPServersConfig,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const json = await apiClient.put<{
      success?: boolean
      message?: string
      status?: MCPServerStatus[]
    }>('/api/mcp/config', config)
    if (json.success === false) {
      return { success: false, message: json.message || 'Failed to update MCP config' }
    }
    return { success: true, status: json.status }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function fetchMCPStatus(): Promise<MCPServerStatus[]> {
  try {
    return await apiClient.get<MCPServerStatus[]>('/api/mcp/status')
  }
  catch {
    return []
  }
}

export async function fetchMCPLogs(limit = 1000): Promise<string[]> {
  try {
    const safeLimit = Math.max(1, Math.min(limit, 1000))
    const json = await apiClient.get<{ lines?: string[] }>(`/api/mcp/logs?limit=${safeLimit}`)
    if (!json.lines || !Array.isArray(json.lines))
      return []
    return json.lines
  }
  catch {
    return []
  }
}

export async function restartMCPServer(
  name?: string,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const url = name ? `/api/mcp/restart/${encodeURIComponent(name)}` : '/api/mcp/restart'
    const json = await apiClient.post<{
      success?: boolean
      message?: string
      status?: MCPServerStatus[]
    }>(url)
    if (json.success === false) {
      return { success: false, message: json.message || 'Failed to restart MCP server' }
    }
    return { success: true, status: json.status }
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
