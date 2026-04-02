/**
 * MCP Client — Connect to Model Context Protocol servers (Node.js only)
 *
 * Uses dynamic imports so `@modelcontextprotocol/sdk` is an optional
 * runtime dependency. Install it separately when MCP support is needed:
 *   pnpm add @modelcontextprotocol/sdk
 *
 * @module mcp/client
 */

import process from 'node:process'
import type { MCPServerConfig } from '../types/mcp.js'
import type { ToolDefinition } from '../types/tool.js'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MCPToolCallResult {
  content: string
  isError: boolean
}

export interface MCPConnection {
  /** Server name as provided in the config key. */
  name: string
  /** Current connection status. */
  status: 'connected' | 'disconnected' | 'error'
  /** Declarative tool definitions fetched from the server. */
  tools: ToolDefinition[]
  /**
   * Call a tool on this server.
   * @param toolName  The MCP tool name (without the `mcp__<server>__` prefix)
   * @param args      Tool input arguments
   */
  call: (toolName: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>
  /** Close the connection cleanly. */
  close: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the qualified tool name used in ToolDefinition: `mcp__<server>__<tool>`. */
export function buildMCPToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`
}

/** Parse the server name and original tool name from a qualified MCP tool name. */
export function parseMCPToolName(qualifiedName: string): { serverName: string, toolName: string } | null {
  const parts = qualifiedName.split('__')
  if (parts.length < 3 || parts[0] !== 'mcp')
    return null
  const serverName = parts[1]
  const toolName = parts.slice(2).join('__')
  return { serverName: serverName!, toolName }
}

/** Check whether a tool name was produced by an MCP server. */
export function isMCPTool(toolName: string): boolean {
  return toolName.startsWith('mcp__')
}

// ---------------------------------------------------------------------------
// connectMCPServer
// ---------------------------------------------------------------------------

/**
 * Connect to a single MCP server and return an MCPConnection.
 *
 * On failure, returns a connection with `status: 'error'` and empty tools
 * rather than throwing, so callers can handle partial failures gracefully.
 */
export async function connectMCPServer(
  name: string,
  config: MCPServerConfig,
): Promise<MCPConnection> {
  if (config.disabled) {
    return { name, status: 'disconnected', tools: [], call: noopCall, close: noopClose }
  }

  try {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')

    let transport: any

    const transportType = config.transportType ?? (config.command ? undefined : 'sse')

    if (!transportType) {
      // stdio: requires command
      if (!config.command)
        throw new Error(`MCP server "${name}" has no command and no transportType`)

      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      })
    }
    else if (transportType === 'sse') {
      if (!config.url)
        throw new Error(`MCP server "${name}" (sse) requires a url`)

      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js')
      transport = new SSEClientTransport(
        new URL(config.url),
        config.headers ? { requestInit: { headers: config.headers } } as any : undefined,
      )
    }
    else if (transportType === 'http') {
      if (!config.url)
        throw new Error(`MCP server "${name}" (http) requires a url`)

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')
      transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        config.headers ? { requestInit: { headers: config.headers } } as any : undefined,
      )
    }
    else {
      throw new Error(`Unsupported MCP transport type: ${transportType}`)
    }

    const client = new Client(
      { name: `locus-agent-${name}`, version: '1.0.0' },
      { capabilities: {} },
    )
    await client.connect(transport)

    const toolList = await client.listTools()
    const tools: ToolDefinition[] = (toolList.tools ?? []).map((mcpTool: any) => ({
      name: buildMCPToolName(name, mcpTool.name),
      description: mcpTool.description ?? `MCP tool ${mcpTool.name} from ${name}`,
      parameters: mcpTool.inputSchema ?? { type: 'object', properties: {} },
    }))

    return {
      name,
      status: 'connected',
      tools,

      async call(toolName, args) {
        try {
          const result = await client.callTool({ name: toolName, arguments: args })
          let content = ''
          if (result.content) {
            for (const block of result.content as any[]) {
              content += block.type === 'text' ? block.text : JSON.stringify(block)
            }
          }
          else {
            content = JSON.stringify(result)
          }
          return { content, isError: Boolean(result.isError) }
        }
        catch (err: any) {
          return { content: `MCP tool error: ${err.message}`, isError: true }
        }
      },

      async close() {
        try { await client.close() }
        catch { /* ignore */ }
      },
    }
  }
  catch (err: any) {
    console.error(`[MCP] Failed to connect to "${name}": ${err.message}`)
    return { name, status: 'error', tools: [], call: noopCall, close: noopClose }
  }
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

/**
 * Connect to multiple MCP servers in parallel.
 * Failed connections are included with `status: 'error'` (never throws).
 */
export async function connectMCPServers(
  configs: Record<string, MCPServerConfig>,
): Promise<MCPConnection[]> {
  return Promise.all(
    Object.entries(configs).map(([name, config]) => connectMCPServer(name, config)),
  )
}

/** Collect all tool definitions from a set of connections. */
export function collectMCPTools(connections: MCPConnection[]): ToolDefinition[] {
  return connections.flatMap(c => c.tools)
}

/** Close all connections gracefully. */
export async function closeAllConnections(connections: MCPConnection[]): Promise<void> {
  await Promise.allSettled(connections.map(c => c.close()))
}

// ---------------------------------------------------------------------------
// Internal stubs
// ---------------------------------------------------------------------------

async function noopCall(): Promise<MCPToolCallResult> {
  return { content: 'Server not connected', isError: true }
}

async function noopClose(): Promise<void> {}
