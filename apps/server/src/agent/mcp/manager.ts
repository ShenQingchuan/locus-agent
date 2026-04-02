import type { MCPClient } from '@ai-sdk/mcp'
import type { MCPServerConfig, MCPServerConnectionStatus, MCPServerStatus } from '@univedge/locus-agent-sdk'
import type { Tool } from 'ai'
import EventEmitter from 'node:events'
import process from 'node:process'
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { tool } from 'ai'
import { getMCPConfig } from './config.js'

const DEFAULT_EXECUTE_TIMEOUT_MS = 60_000
const UNCAUGHT_ERROR_LOG_THROTTLE_MS = 30_000
const RECONNECT_BASE_DELAY_MS = 5_000
const RECONNECT_MAX_DELAY_MS = 60_000
const RECONNECT_JITTER_MS = 1_500
const MAX_RECONNECT_ATTEMPTS = 0
const HTTP_IDLE_DISCONNECT_MS = 120_000
const MAX_LOG_LINES = 1_000

type LogLevel = 'info' | 'warn' | 'error'

/**
 * MCP 状态变化事件类型
 */
export interface MCPStatusChangeEvent {
  name: string
  status: MCPServerConnectionStatus
  error?: string
  tools: string[]
  disabled: boolean
}

interface ServerEntry {
  client: MCPClient | null
  tools: Record<string, Tool>
  executors: Map<string, (args: unknown) => Promise<unknown>>
  status: MCPServerConnectionStatus
  error?: string
  toolNames: string[]
  disabled: boolean
  lastActiveAt: number
}

class MCPManager extends EventEmitter {
  private servers = new Map<string, ServerEntry>()
  private serverConfigs = new Map<string, MCPServerConfig>()
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private idleDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private connectPromises = new Map<string, Promise<void>>()
  private reconnectAttempts = new Map<string, number>()
  private lastErrorLogAt = new Map<string, number>()
  private logs: string[] = []

  /**
   * 发送状态变化事件
   */
  private emitStatusChange(name: string): void {
    const entry = this.servers.get(name)
    if (!entry)
      return
    const event: MCPStatusChangeEvent = {
      name,
      status: entry.status,
      error: entry.error,
      tools: entry.toolNames,
      disabled: entry.disabled,
    }
    this.emit('statusChange', event)
  }

  async initialize(): Promise<void> {
    const config = await getMCPConfig()
    const entries = Object.entries(config.mcpServers)
    this.serverConfigs = new Map(entries)

    if (entries.length === 0)
      return

    await Promise.allSettled(entries.map(([name, cfg]) => this.connectServer(name, cfg)))
  }

  async reload(): Promise<void> {
    await this.closeAll()
    await this.initialize()
  }

  async restartServer(name: string): Promise<void> {
    await this.disconnectServer(name, { preserveEntry: true, reason: 'manual-restart' })

    const config = await getMCPConfig()
    const serverConfig = config.mcpServers[name]
    if (!serverConfig) {
      throw new Error(`MCP server "${name}" not found in config`)
    }

    this.serverConfigs.set(name, serverConfig)
    await this.connectServer(name, serverConfig)
  }

  getAllTools(): Record<string, Tool> {
    const merged: Record<string, Tool> = {}
    for (const entry of this.servers.values()) {
      if (entry.toolNames.length > 0 && !entry.disabled) {
        Object.assign(merged, entry.tools)
      }
    }
    return merged
  }

  hasTool(toolName: string): boolean {
    for (const entry of this.servers.values()) {
      if (entry.disabled)
        continue

      if (entry.executors.has(toolName) || entry.toolNames.includes(toolName)) {
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

    const candidateServerNames = this.collectToolCandidates(toolName)
    let lastError: Error | undefined
    for (const serverName of candidateServerNames) {
      try {
        await this.ensureServerReadyForTool(serverName, toolName)
        const entry = this.servers.get(serverName)
        if (!entry || entry.disabled) {
          throw new Error(`MCP server "${serverName}" is unavailable`)
        }

        const executor = entry.executors.get(toolName)
        if (!executor) {
          throw new Error(`MCP tool "${toolName}" not ready on "${serverName}"`)
        }

        const result = await this.executeToolWithTimeout({
          serverName,
          toolName,
          args,
          timeoutMs,
          executor,
        })
        entry.error = undefined
        this.markServerActive(serverName)
        return typeof result === 'string' ? result : JSON.stringify(result)
      }
      catch (error) {
        const message = this.buildExecutionErrorMessage(serverName, toolName, error)
        const entry = this.servers.get(serverName)
        if (entry)
          entry.error = message
        this.logServerError(serverName, message, error)
        if (this.isTimeoutLikeError(error) || this.isConnectionLikeError(error)) {
          this.scheduleReconnect(serverName, this.isTimeoutLikeError(error) ? 'tool-timeout' : 'tool-connection-error')
        }
        lastError = new Error(message)
      }
    }

    if (lastError)
      throw lastError

    throw new Error(`MCP tool not found: ${toolName}`)
  }

  getStatus(): MCPServerStatus[] {
    return Array.from(this.servers.entries(), ([name, entry]) => ({
      name,
      status: entry.status,
      error: entry.error,
      tools: entry.toolNames,
      disabled: entry.disabled,
    }))
  }

  getLogs(limit = MAX_LOG_LINES): string[] {
    const safeLimit = Math.max(1, Math.min(limit, MAX_LOG_LINES))
    return this.logs.slice(-safeLimit)
  }

  async closeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.servers.keys(), name => this.disconnectServer(name, { preserveEntry: false, reason: 'close-all' })),
    )
    this.serverConfigs.clear()
  }

  private async connectServer(name: string, config: MCPServerConfig): Promise<void> {
    this.serverConfigs.set(name, config)
    const existingPromise = this.connectPromises.get(name)
    if (existingPromise)
      return existingPromise

    const promise = this.connectServerInternal(name, config)
      .finally(() => {
        this.connectPromises.delete(name)
      })
    this.connectPromises.set(name, promise)
    return promise
  }

  private async connectServerInternal(name: string, config: MCPServerConfig): Promise<void> {
    this.clearReconnectTimer(name)
    this.clearIdleDisconnectTimer(name)

    if (config.disabled) {
      this.servers.set(name, {
        client: null,
        tools: {},
        executors: new Map(),
        status: 'disconnected',
        toolNames: [],
        disabled: true,
        lastActiveAt: Date.now(),
      })
      this.logServer('info', name, 'disabled by config')
      return
    }

    const entry: ServerEntry = this.servers.get(name) ?? {
      client: null,
      tools: {},
      executors: new Map(),
      status: 'disconnected' as MCPServerConnectionStatus,
      toolNames: [],
      disabled: false,
      error: undefined,
      lastActiveAt: Date.now(),
    }
    entry.status = 'connecting'
    entry.disabled = false
    entry.error = undefined
    this.servers.set(name, entry)
    this.emitStatusChange(name)

    try {
      const transport = this.createTransport(config)
      const client = await createMCPClient({
        transport,
        name: `locus-agent-mcp-${name}`,
        onUncaughtError: (error) => {
          this.handleUncaughtServerError(name, entry, error)
        },
      })

      if (entry.client && entry.client !== client) {
        try {
          await entry.client.close()
        }
        catch (error) {
          this.logServer('warn', name, `close stale client failed: ${this.formatErrorMessage(error)}`)
        }
      }

      entry.client = client
      entry.executors.clear()

      const rawTools = await client.tools()
      const nextTools: Record<string, Tool> = {}

      for (const [toolName, rawTool] of Object.entries(rawTools)) {
        const t = rawTool as Tool & { execute?: (args: unknown) => Promise<unknown>, description?: string, inputSchema?: unknown }
        // Ensure input_schema has "type" field — some MCP servers omit it,
        // which causes Anthropic API to reject the request.
        const schema = (t.inputSchema && typeof t.inputSchema === 'object')
          ? { type: 'object', ...(t.inputSchema as Record<string, unknown>) }
          : t.inputSchema
        nextTools[toolName] = tool({
          description: t.description ?? '',
          inputSchema: schema as any,
        })
        if (t.execute) {
          entry.executors.set(toolName, t.execute)
        }
      }

      entry.tools = nextTools
      entry.toolNames = Object.keys(nextTools)
      entry.status = 'connected'
      entry.error = undefined
      entry.lastActiveAt = Date.now()
      this.reconnectAttempts.delete(name)
      this.logServer('info', name, `connected, ${entry.toolNames.length} tools: ${entry.toolNames.join(', ')}`)
      this.emitStatusChange(name)
      this.scheduleIdleDisconnectIfNeeded(name)
    }
    catch (error) {
      entry.status = 'error'
      entry.error = this.formatErrorMessage(error)
      // Clear the cached promise eagerly so the next caller retries
      // instead of reusing this resolved-but-failed attempt.
      this.connectPromises.delete(name)
      this.logServer('error', name, `connection failed: ${entry.error}`)
      this.emitStatusChange(name)
      this.scheduleReconnect(name, 'connect-failed')
    }
  }

  private async disconnectServer(
    name: string,
    options: { preserveEntry: boolean, reason: string },
  ): Promise<void> {
    this.clearReconnectTimer(name)
    this.clearIdleDisconnectTimer(name)
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
      this.logServer('warn', name, `close error: ${this.formatErrorMessage(error)}`)
    }

    entry.client = null
    entry.executors.clear()
    entry.lastActiveAt = Date.now()
    entry.error = undefined

    if (options.preserveEntry) {
      entry.status = 'disconnected'
      this.servers.set(name, entry)
      this.emitStatusChange(name)
      this.logServer('info', name, `disconnected (${options.reason})`)
      return
    }

    this.logServer('info', name, `disconnected and removed (${options.reason})`)
    this.servers.delete(name)
    this.serverConfigs.delete(name)
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
    const connectionLike = this.isConnectionLikeError(error)
    const message = this.formatErrorMessage(error)

    // HTTP transports may surface idle SSE timeouts even when tool calls remain healthy.
    // Keep connected servers available and only log this as a recoverable signal.
    if (timeoutLike && entry.status === 'connected') {
      const logKey = `${name}:uncaught:recoverable-timeout`
      const now = Date.now()
      const last = this.lastErrorLogAt.get(logKey) ?? 0
      if (now - last >= UNCAUGHT_ERROR_LOG_THROTTLE_MS) {
        this.lastErrorLogAt.set(logKey, now)
        this.logServer('warn', name, `recoverable timeout: ${message}`)
      }
      return
    }

    if (connectionLike && entry.status === 'connected') {
      entry.status = 'error'
      entry.error = message
      this.emitStatusChange(name)
      const logKey = `${name}:uncaught:recoverable-connection`
      const now = Date.now()
      const last = this.lastErrorLogAt.get(logKey) ?? 0
      if (now - last >= UNCAUGHT_ERROR_LOG_THROTTLE_MS) {
        this.lastErrorLogAt.set(logKey, now)
        this.logServer('warn', name, `recoverable connection drop: ${message}`)
      }
      this.scheduleReconnect(name, 'uncaught-connection')
      return
    }

    entry.status = 'error'
    entry.error = message
    this.emitStatusChange(name)

    const logKey = `${name}:uncaught:${timeoutLike ? 'timeout' : 'other'}`
    const now = Date.now()
    const last = this.lastErrorLogAt.get(logKey) ?? 0
    if (now - last >= UNCAUGHT_ERROR_LOG_THROTTLE_MS) {
      this.lastErrorLogAt.set(logKey, now)
      this.logServer('error', name, 'uncaught error', error)
    }

    this.scheduleReconnect(name, timeoutLike ? 'uncaught-timeout' : 'uncaught-error')
  }

  private scheduleReconnect(name: string, reason: string): void {
    if (this.reconnectTimers.has(name))
      return

    const entry = this.servers.get(name)
    if (!entry || entry.disabled)
      return

    const attempt = (this.reconnectAttempts.get(name) ?? 0) + 1
    if (MAX_RECONNECT_ATTEMPTS > 0 && attempt > MAX_RECONNECT_ATTEMPTS) {
      this.logServer('warn', name, `reconnect skipped: exceeded max attempts (${MAX_RECONNECT_ATTEMPTS})`)
      return
    }

    this.reconnectAttempts.set(name, attempt)
    const backoffDelay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS)
    const jitter = Math.floor(Math.random() * RECONNECT_JITTER_MS)
    const delay = backoffDelay + jitter
    this.logServer('warn', name, `scheduling reconnect #${attempt} in ${delay}ms (${reason})`)

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(name)
      const currentEntry = this.servers.get(name)
      if (!currentEntry || currentEntry.disabled)
        return

      try {
        const config = this.serverConfigs.get(name)
        if (!config || config.disabled)
          return

        await this.connectServer(name, config)
        const newEntry = this.servers.get(name)
        if (newEntry?.status === 'connected') {
          this.reconnectAttempts.delete(name)
          return
        }
      }
      catch (error) {
        this.logServer('error', name, `reconnect failed: ${this.formatErrorMessage(error)}`)
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

  private clearIdleDisconnectTimer(name: string): void {
    const timer = this.idleDisconnectTimers.get(name)
    if (timer) {
      clearTimeout(timer)
      this.idleDisconnectTimers.delete(name)
    }
  }

  private scheduleIdleDisconnectIfNeeded(name: string): void {
    this.clearIdleDisconnectTimer(name)

    const entry = this.servers.get(name)
    if (!entry || entry.status !== 'connected' || entry.disabled)
      return

    const config = this.serverConfigs.get(name)
    if (!config || !this.shouldUseOnDemandLifecycle(config))
      return

    const timer = setTimeout(() => {
      void this.handleIdleDisconnect(name)
    }, HTTP_IDLE_DISCONNECT_MS)

    this.idleDisconnectTimers.set(name, timer)
  }

  private async handleIdleDisconnect(name: string): Promise<void> {
    this.idleDisconnectTimers.delete(name)

    const entry = this.servers.get(name)
    const config = this.serverConfigs.get(name)
    if (!entry || !config || entry.disabled || entry.status !== 'connected')
      return
    if (!this.shouldUseOnDemandLifecycle(config))
      return

    const idleFor = Date.now() - entry.lastActiveAt
    if (idleFor < HTTP_IDLE_DISCONNECT_MS) {
      this.scheduleIdleDisconnectIfNeeded(name)
      return
    }

    this.logServer('info', name, `idle for ${idleFor}ms, disconnecting HTTP transport`)
    await this.disconnectServer(name, { preserveEntry: true, reason: 'idle-timeout' })
  }

  private markServerActive(name: string): void {
    const entry = this.servers.get(name)
    if (!entry)
      return

    entry.lastActiveAt = Date.now()
    if (entry.status === 'connected') {
      this.scheduleIdleDisconnectIfNeeded(name)
    }
  }

  private shouldUseOnDemandLifecycle(config: MCPServerConfig): boolean {
    return !!config.url && config.transportType === 'http'
  }

  private collectToolCandidates(toolName: string): string[] {
    const serverNames: string[] = []
    for (const [name, entry] of this.servers.entries()) {
      if (entry.disabled)
        continue
      if (entry.executors.has(toolName) || entry.toolNames.includes(toolName)) {
        serverNames.push(name)
      }
    }
    return serverNames
  }

  private async ensureServerReadyForTool(name: string, toolName: string): Promise<void> {
    const entry = this.servers.get(name)
    if (!entry || entry.disabled) {
      throw new Error(`MCP server "${name}" is unavailable`)
    }

    if (entry.status === 'connected' && entry.executors.has(toolName)) {
      this.markServerActive(name)
      return
    }

    const config = this.serverConfigs.get(name)
    if (!config || config.disabled) {
      throw new Error(`MCP server "${name}" config unavailable`)
    }

    this.logServer('info', name, `connecting on demand for tool "${toolName}"`)
    await this.connectServer(name, config)

    const connectedEntry = this.servers.get(name)
    if (!connectedEntry || connectedEntry.status !== 'connected' || !connectedEntry.executors.has(toolName)) {
      throw new Error(`MCP tool "${toolName}" not available after reconnect`)
    }
    this.markServerActive(name)
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
    if (now - last >= UNCAUGHT_ERROR_LOG_THROTTLE_MS) {
      this.lastErrorLogAt.set(logKey, now)
      this.logServer('error', serverName, message)
    }
  }

  private isTimeoutLikeError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return true
    }

    const message = this.formatErrorMessage(error).toLowerCase()
    return message.includes('timed out') || message.includes('timeout')
  }

  private isConnectionLikeError(error: unknown): boolean {
    const message = this.formatErrorMessage(error).toLowerCase()
    return message.includes('econnreset')
      || message.includes('socket connection was closed unexpectedly')
      || message.includes('connection closed')
      || message.includes('socket hang up')
      || message.includes('network error')
  }

  private logServer(level: LogLevel, serverName: string, message: string, detail?: unknown): void {
    this.writeLog(level, `[MCP:${serverName}] ${message}`, detail)
  }

  private writeLog(level: LogLevel, message: string, detail?: unknown): void {
    const suffix = detail === undefined ? '' : ` ${this.serializeLogDetail(detail)}`
    const line = `${new Date().toISOString()} ${message}${suffix}`
    this.logs.push(line)
    if (this.logs.length > MAX_LOG_LINES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
    }

    if (level === 'error')
      console.error(line)
    else if (level === 'warn')
      console.warn(line)
    else
      console.warn(line)
  }

  private serializeLogDetail(detail: unknown): string {
    if (detail instanceof Error) {
      return detail.stack || detail.message
    }
    if (typeof detail === 'string') {
      return detail
    }
    try {
      return JSON.stringify(detail)
    }
    catch {
      return String(detail)
    }
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export const mcpManager = new MCPManager()
