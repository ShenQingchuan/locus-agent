/**
 * High-level query and agent configuration types.
 *
 * These contracts define how an agent is configured and what results it
 * returns. They are compatible with both the open-agent-sdk pattern and the
 * official @anthropic-ai/claude-agent-sdk API surface.
 *
 * Concrete engine implementations (e.g. using Vercel AI SDK, Anthropic SDK,
 * or any other provider) should accept `AgentOptions` / `QueryEngineConfig`
 * and return `SDKMessage` streams or `QueryResult`.
 *
 * @module runtime/query
 */

import type { MCPServerConfig } from '../types/mcp.js'
import type { CoreMessage } from '../types/message.js'
import type { SDKMessage, SDKTokenUsage } from '../types/sdk-message.js'
import type { ToolDefinition } from '../types/tool.js'

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/**
 * Controls how the agent handles tool permission requests.
 *
 * - `default`            — Ask user before each tool call
 * - `acceptEdits`        — Auto-approve file edit operations
 * - `bypassPermissions`  — Skip all permission checks (dangerous, use in sandboxes)
 * - `plan`               — Planning mode; tools that modify state are blocked
 * - `dontAsk`            — Deny unrecognised tools silently, no prompting
 * - `auto`               — Heuristic-based automatic decisions
 */
export type PermissionMode
  = | 'default'
    | 'acceptEdits'
    | 'bypassPermissions'
    | 'plan'
    | 'dontAsk'
    | 'auto'

export interface CanUseToolResult {
  behavior: 'allow' | 'deny'
  /** Replacement input to pass to the tool when `behavior` is `'allow'`. */
  updatedInput?: unknown
  /** Human-readable reason (shown in UI on deny). */
  message?: string
}

export type CanUseToolFn = (
  toolName: string,
  input: unknown,
) => Promise<CanUseToolResult>

// ---------------------------------------------------------------------------
// Thinking / Effort
// ---------------------------------------------------------------------------

/**
 * Extended thinking configuration.
 *
 * - `adaptive` — SDK decides dynamically (default)
 * - `enabled`  — Always enable; `budgetTokens` controls the budget
 * - `disabled` — Never use extended thinking
 */
export interface ThinkingConfig {
  type: 'adaptive' | 'enabled' | 'disabled'
  /** Token budget when `type` is `'enabled'`. */
  budgetTokens?: number
}

/** Controls reasoning depth for models that support effort levels. */
export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export interface SandboxFilesystemConfig {
  allowWrite?: string[]
  denyWrite?: string[]
  denyRead?: string[]
}

export interface SandboxNetworkConfig {
  allowedDomains?: string[]
  allowManagedDomainsOnly?: boolean
  offline?: boolean
}

export interface SandboxSettings {
  enabled?: boolean
  autoAllowBashIfSandboxed?: boolean
  filesystem?: SandboxFilesystemConfig
  network?: SandboxNetworkConfig
  excludedCommands?: string[]
}

// ---------------------------------------------------------------------------
// Agent / Sub-agent definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  description: string
  prompt: string
  tools?: string[]
  disallowedTools?: string[]
  /** `'inherit'` = use the parent agent's model */
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit' | (string & {})
  mcpServers?: Array<string | { name: string, tools?: string[] }>
  maxTurns?: number
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type SettingSource = 'user' | 'project' | 'local'

export interface OutputFormat {
  type: 'json_schema'
  schema: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// AgentOptions — high-level one-shot or multi-turn config
// ---------------------------------------------------------------------------

/**
 * Configuration for a single agent run via `createAgent()` or `query()`.
 * Aligns with `@anthropic-ai/claude-agent-sdk` Options type.
 */
export interface AgentOptions {
  // Core
  model?: string
  apiKey?: string
  baseURL?: string
  cwd?: string
  systemPrompt?: string | { type: 'preset', preset: 'default', append?: string }
  appendSystemPrompt?: string

  // Tools
  tools?: ToolDefinition[] | string[]
  allowedTools?: string[]
  disallowedTools?: string[]
  maxTurns?: number
  maxBudgetUsd?: number

  // Thinking
  thinking?: ThinkingConfig
  effortLevel?: EffortLevel

  // MCP
  mcpServers?: Record<string, MCPServerConfig>

  // Sub-agents
  agents?: Record<string, AgentDefinition>

  // Session
  resume?: string
  sessionId?: string
  persistSession?: boolean
  forkSession?: boolean

  // Permissions
  permissionMode?: PermissionMode
  canUseTool?: CanUseToolFn

  // Output
  jsonSchema?: Record<string, unknown>
  outputFormat?: OutputFormat
  includePartialMessages?: boolean

  // Sandbox
  sandbox?: SandboxSettings

  // Settings
  settingSources?: SettingSource[]

  // Cancellation
  abortSignal?: AbortSignal
  abortController?: AbortController

  // Debug
  debug?: boolean

  // Environment
  env?: Record<string, string | undefined>
}

// ---------------------------------------------------------------------------
// QueryEngineConfig — low-level engine configuration
// ---------------------------------------------------------------------------

/**
 * Internal configuration for a `QueryEngine` instance.
 * Usually derived from `AgentOptions` by the `createAgent()` factory.
 */
export interface QueryEngineConfig {
  cwd: string
  model: string
  apiKey?: string
  baseURL?: string
  tools: ToolDefinition[]
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns: number
  maxBudgetUsd?: number
  maxTokens: number
  thinking?: ThinkingConfig
  effortLevel?: EffortLevel
  jsonSchema?: Record<string, unknown>
  canUseTool?: CanUseToolFn
  permissionMode?: PermissionMode
  includePartialMessages: boolean
  abortSignal?: AbortSignal
  agents?: Record<string, AgentDefinition>
  /** Initial messages for session resumption. */
  initialMessages?: CoreMessage[]
  env?: Record<string, string | undefined>
  debug?: boolean
}

// ---------------------------------------------------------------------------
// QueryResult — final outcome of a completed query
// ---------------------------------------------------------------------------

export interface QueryResult {
  /** Concatenated text output from the assistant. */
  text: string
  /** Accumulated token usage. */
  usage: SDKTokenUsage
  /** Number of agentic turns taken. */
  numTurns: number
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** All conversation messages after the run. */
  messages: CoreMessage[]
}

// ---------------------------------------------------------------------------
// IQueryEngine — interface that concrete engines should implement
// ---------------------------------------------------------------------------

/**
 * Contract for query engine implementations.
 *
 * Implementations differ by which LLM SDK they use internally (Vercel AI SDK,
 * Anthropic SDK, etc.) but expose the same streaming interface.
 */
export interface IQueryEngine {
  /**
   * Submit a user prompt and stream response events.
   * The generator yields `SDKMessage` events and completes when the agent
   * finishes (either naturally or due to turn/budget limits).
   */
  submitMessage: (prompt: string) => AsyncGenerator<SDKMessage>

  /** Get the current conversation messages (copy). */
  getMessages: () => CoreMessage[]

  /** Get accumulated token usage. */
  getUsage: () => SDKTokenUsage

  /** Get estimated total cost in USD. */
  getCost: () => number
}
