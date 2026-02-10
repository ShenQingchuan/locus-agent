import type { MCPClient } from '@ai-sdk/mcp'
import type { MCPServerConfig, MCPServerConnectionStatus, MCPServerStatus } from '@locus-agent/shared'
import type { Tool } from 'ai'
import process from 'node:process'
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { tool } from 'ai'
import { getMCPConfig } from './config.js'

interface ServerEntry {
  client: MCPClient
  /** Schema-only tools (no execute) for streamText */
  tools: Record<string, Tool>
  /** Original execute functions keyed by tool name */
  executors: Map<string, (args: unknown) => Promise<unknown>>
  status: MCPServerConnectionStatus
  error?: string
  toolNames: string[]
  disabled: boolean
}

class MCPManager {
  private servers = new Map<string, ServerEntry>()

  /**
   * 从持久化配置初始化所有 MCP Server 连接
   */
  async initialize(): Promise<void> {
    const config = await getMCPConfig()
    const entries = Object.entries(config.mcpServers)
    if (entries.length === 0)
      return

    await Promise.allSettled(
      entries.map(([name, cfg]) => this.connectServer(name, cfg)),
    )
  }

  /**
   * 重新加载配置并重连所有 Server
   */
  async reload(): Promise<void> {
    await this.closeAll()
    await this.initialize()
  }

  /**
   * 重启指定 Server
   */
  async restartServer(name: string): Promise<void> {
    await this.disconnectServer(name)

    const config = await getMCPConfig()
    const serverConfig = config.mcpServers[name]
    if (!serverConfig) {
      throw new Error(`MCP server "${name}" not found in config`)
    }
    await this.connectServer(name, serverConfig)
  }

  /**
   * 获取所有已连接 Server 的 schema-only 工具（合并为一个 Record）
   */
  getAllTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {}
    for (const entry of this.servers.values()) {
      if (entry.status === 'connected' && !entry.disabled) {
        Object.assign(merged, entry.tools)
      }
    }
    return merged
  }

  /**
   * 检查工具是否由某个 MCP Server 提供
   */
  hasTool(toolName: string): boolean {
    for (const entry of this.servers.values()) {
      if (entry.status === 'connected' && !entry.disabled && entry.executors.has(toolName)) {
        return true
      }
    }
    return false
  }

  /**
   * 执行 MCP 工具调用
   */
  async executeToolCall(toolName: string, args: unknown): Promise<string> {
    for (const entry of this.servers.values()) {
      if (entry.status !== 'connected' || entry.disabled)
        continue
      const executor = entry.executors.get(toolName)
      if (executor) {
        const result = await executor(args)
        return typeof result === 'string' ? result : JSON.stringify(result)
      }
    }
    throw new Error(`MCP tool not found: ${toolName}`)
  }

  /**
   * 获取所有 Server 的运行时状态
   */
  getStatus(): MCPServerStatus[] {
    return Array.from(this.servers.entries()).map(([name, entry]) => ({
      name,
      status: entry.status,
      error: entry.error,
      tools: entry.toolNames,
      disabled: entry.disabled,
    }))
  }

  /**
   * 关闭所有 MCP 连接
   */
  async closeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.servers.keys()).map(name => this.disconnectServer(name)),
    )
  }

  // -- private --

  private async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    if (config.disabled) {
      this.servers.set(name, {
        client: null as unknown as MCPClient,
        tools: {},
        executors: new Map(),
        status: 'disconnected',
        toolNames: [],
        disabled: true,
      })
      return
    }

    const entry: ServerEntry = {
      client: null as unknown as MCPClient,
      tools: {},
      executors: new Map(),
      status: 'connecting',
      toolNames: [],
      disabled: false,
    }
    this.servers.set(name, entry)

    try {
      const transport = this.createTransport(config)
      const client = await createMCPClient({
        transport,
        name: `locus-agent-mcp-${name}`,
        onUncaughtError: (error) => {
          console.error(`[MCP:${name}] uncaught error:`, error)
          entry.status = 'error'
          entry.error = error instanceof Error ? error.message : String(error)
        },
      })

      entry.client = client

      // Fetch tools and separate schema from executors
      const rawTools = await client.tools()
      for (const [toolName, rawTool] of Object.entries(rawTools)) {
        const t = rawTool as Tool & { execute?: (args: unknown) => Promise<unknown>, description?: string, inputSchema?: unknown }

        // Schema-only tool for streamText (no execute → SDK won't auto-execute)
        entry.tools[toolName] = tool({
          description: t.description ?? '',
          inputSchema: t.inputSchema as any,
        })

        // Store executor for manual invocation
        if (t.execute) {
          entry.executors.set(toolName, t.execute)
        }
      }

      entry.toolNames = Object.keys(entry.tools)
      entry.status = 'connected'
      entry.error = undefined
      console.warn(`[MCP:${name}] connected, ${entry.toolNames.length} tools: ${entry.toolNames.join(', ')}`)
    }
    catch (error) {
      entry.status = 'error'
      entry.error = error instanceof Error ? error.message : String(error)
      console.error(`[MCP:${name}] connection failed:`, entry.error)
    }
  }

  private async disconnectServer(name: string): Promise<void> {
    const entry = this.servers.get(name)
    if (!entry)
      return
    try {
      if (entry.client && entry.status !== 'disconnected') {
        await entry.client.close()
      }
    }
    catch (error) {
      console.error(`[MCP:${name}] close error:`, error)
    }
    this.servers.delete(name)
  }

  private createTransport(config: MCPServerConfig) {
    if (config.command) {
      return new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args,
        env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
      })
    }
    if (config.url) {
      const type = config.transportType === 'http' ? 'http' as const : 'sse' as const
      return {
        type,
        url: config.url,
        ...(config.headers && Object.keys(config.headers).length > 0 ? { headers: config.headers } : {}),
      }
    }
    throw new Error('MCP server config must specify either "command" or "url"')
  }
}

/** Singleton instance */
export const mcpManager = new MCPManager()
