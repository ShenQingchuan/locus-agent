import type { MCPClient } from '@ai-sdk/mcp'
import type { MCPServerConfig, MCPServerConnectionStatus, MCPServerStatus } from '@locus-agent/shared'
import type { Tool } from 'ai'
import process from 'node:process'
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { tool } from 'ai'
import { getMCPConfig } from './config.js'

const DEFAULT_EXECUTE_TIMEOUT_MS = 60_000
const UNCUGHT_ERROR_LOG_THROTTLE_MS = 30_000
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 60_000
const MAX_RECONNECT_ATTEMPTS = 5

interface ServerEntry {
  client: MCPClient
  tools: Record<string, Tool>
  executors: Map<string, (args: unknown) => Promise<unknown>>
  status: MCPServerConnectionStatus
  error?: string
  toolNames: string[]
  disabled: boolean
}

class MCPManager {
  private servers = new Map<string, ServerEntry>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private reconnectAttempts = new Map<string, number>()
  private lastErrorLogAt = new Map<string, number>()

  async initialize(): Promise<void> {
    const config = await getMCPConfig()
    const entries = Object.entries(config.mcpServers)
    if (entries.length === 0)
      return

    await Promise.allSettled(entries.map(([name, cfg]) => this.connectServer(name, cfg)))
  }

  async reload(): Promise<void> {
    await this.closeAll()
    await this.initialize()
  }

  async restartServer(name: string): Promise<void> {
    await this.disconnectServer(name)

    const config = await getMCPConfig()
    const serverConfig = config.mcpServers[name]
    if (!serverConfig) {
      throw new Error(`MCP server "${name}" not found in config`)
    }

    await this.connectServer(name, serverConfig)
  }

  getAllTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {}
    for (const entry of this.servers.values()) {
      if (entry.status === 'connected' && !entry.disabled) {
        Object.assign(merged, entry.tools)
      }
    }
    return merged
  }

  hasTool(toolName: string): boolean {
    for (const entry of this.servers.values()) {
      if (entry.status === 'connected' && !entry.disabled && entry.executors.has(toolName)) {
        return true
      }
    }
    return false
  }

  async executeToolCall(
    toolName: string,
    args: unknown,
    options?: { timeoutMs?: number },
  ): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_EXECUTE_TIMEOUT_MS

    for (const [serverName, entry] of this.servers.entries()) {
      if (entry.status !== 'connected' || entry.disabled)
        continue

      const executor = entry.executors.get(toolName)
      if (!executor)
        continue

      try {
        const result = await this.executeToolWithTimeout({
          serverName,
          toolName,
          args,
          timeoutMs,
          executor,
        })
        entry.error = undefined
        return typeof result === 'string' ? result : JSON.stringify(result)
      }
      catch (error) {
        const message = this.buildExecutionErrorMessage(serverName, toolName, error)
        entry.error = message
        this.logServerError(serverName, message, error)
        if (this.isTimeoutLikeError(error)) {
          this.scheduleReconnect(serverName, 'tool-timeout')
        }
        throw new Error(message)
      }
    }

    throw new Error(`MCP tool not found: ${toolName}`)
  }

  getStatus(): MCPServerStatus[] {
    return Array.from(this.servers.entries()).map(([name, entry]) => ({
      name,
      status: entry.status,
      error: entry.error,
      tools: entry.toolNames,
      disabled: entry.disabled,
    }))
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.servers.keys()).map(name => this.disconnectServer(name)))
  }

  private async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    this.clearReconnectTimer(name)

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
          this.handleUncaughtServerError(name, entry, error)
        },
      })

      entry.client = client
      const rawTools = await client.tools()

      for (const [toolName, rawTool] of Object.entries(rawTools)) {
        const t = rawTool as Tool & { execute?: (args: unknown) => Promise<unknown>, description?: string, inputSchema?: unknown }
        entry.tools[toolName] = tool({
          description: t.description ?? '',
          inputSchema: t.inputSchema as any,
        })
        if (t.execute) {
          entry.executors.set(toolName, t.execute)
        }
      }

      entry.toolNames = Object.keys(entry.tools)
      entry.status = 'connected'
      entry.error = undefined
      this.reconnectAttempts.delete(name)
      console.warn(`[MCP:${name}] connected, ${entry.toolNames.length} tools: ${entry.toolNames.join(', ')}`)
    }
    catch (error) {
      entry.status = 'error'
      entry.error = this.formatErrorMessage(error)
      console.error(`[MCP:${name}] connection failed:`, entry.error)
      this.scheduleReconnect(name, 'connect-failed')
    }
  }

  private async disconnectServer(name: string): Promise<void> {
    this.clearReconnectTimer(name)
    this.reconnectAttempts.delete(name)

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

  private async executeToolWithTimeout(options: {
    serverName: string
    toolName: string
    args: unknown
    timeoutMs: number
    executor: (args: unknown) => Promise<unknown>
  }): Promise<unknown> {
    const { serverName, toolName, args, timeoutMs, executor } = options
    if (timeoutMs <= 0) {
      return executor(args)
    }

    return Promise.race([
      executor(args),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`MCP tool "${toolName}" on "${serverName}" timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  }

  private handleUncaughtServerError(name: string, entry: ServerEntry, error: unknown): void {
    const timeoutLike = this.isTimeoutLikeError(error)
    const message = this.formatErrorMessage(error)

    // HTTP transports may surface idle SSE timeouts even when tool calls remain healthy.
    // Keep connected servers available and only log this as a recoverable signal.
    if (timeoutLike && entry.status === 'connected') {
      const logKey = `${name}:uncaught:recoverable-timeout`
      const now = Date.now()
      const last = this.lastErrorLogAt.get(logKey) ?? 0
      if (now - last >= UNCUGHT_ERROR_LOG_THROTTLE_MS) {
        this.lastErrorLogAt.set(logKey, now)
        console.warn(`[MCP:${name}] recoverable timeout: ${message}`)
      }
      return
    }

    entry.status = 'error'
    entry.error = message

    const logKey = `${name}:uncaught:${timeoutLike ? 'timeout' : 'other'}`
    const now = Date.now()
    const last = this.lastErrorLogAt.get(logKey) ?? 0
    if (now - last >= UNCUGHT_ERROR_LOG_THROTTLE_MS) {
      this.lastErrorLogAt.set(logKey, now)
      console.error(`[MCP:${name}] uncaught error:`, error)
    }

    this.scheduleReconnect(name, timeoutLike ? 'uncaught-timeout' : 'uncaught-error')
  }

  private scheduleReconnect(name: string, reason: string): void {
    if (this.reconnectTimers.has(name))
      return

    const attempt = (this.reconnectAttempts.get(name) ?? 0) + 1
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[MCP:${name}] reconnect skipped: exceeded max attempts (${MAX_RECONNECT_ATTEMPTS})`)
      return
    }

    this.reconnectAttempts.set(name, attempt)
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS)
    console.warn(`[MCP:${name}] scheduling reconnect #${attempt} in ${delay}ms (${reason})`)

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(name)
      const entry = this.servers.get(name)
      if (!entry || entry.disabled)
        return

      try {
        await this.restartServer(name)
        const newEntry = this.servers.get(name)
        if (newEntry?.status === 'connected') {
          this.reconnectAttempts.delete(name)
          return
        }
      }
      catch (error) {
        console.error(`[MCP:${name}] reconnect failed:`, this.formatErrorMessage(error))
      }

      this.scheduleReconnect(name, 'retry')
    }, delay)

    this.reconnectTimers.set(name, timer)
  }

  private clearReconnectTimer(name: string): void {
    const timer = this.reconnectTimers.get(name)
    if (timer) {
      clearTimeout(timer)
      this.reconnectTimers.delete(name)
    }
  }

  private buildExecutionErrorMessage(serverName: string, toolName: string, error: unknown): string {
    const base = this.formatErrorMessage(error)
    return `MCP tool execution failed (${serverName}/${toolName}): ${base}`
  }

  private logServerError(serverName: string, message: string, error: unknown): void {
    const bucket = this.isTimeoutLikeError(error) ? 'timeout' : 'error'
    const logKey = `${serverName}:execute:${bucket}`
    const now = Date.now()
    const last = this.lastErrorLogAt.get(logKey) ?? 0
    if (now - last >= UNCUGHT_ERROR_LOG_THROTTLE_MS) {
      this.lastErrorLogAt.set(logKey, now)
      console.error(`[MCP:${serverName}] ${message}`)
    }
  }

  private isTimeoutLikeError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return true
    }

    const message = this.formatErrorMessage(error).toLowerCase()
    return message.includes('timed out') || message.includes('timeout')
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const mcpManager = new MCPManager()
