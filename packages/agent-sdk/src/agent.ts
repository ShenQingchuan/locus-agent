/**
 * High-level Agent API.
 *
 * Provides the `Agent` class and `createAgent()` factory — the primary public
 * interface for agent consumers. Concrete implementations inject a
 * `QueryEngineFactory` so the Agent class stays independent of any specific
 * LLM SDK.
 *
 * @example
 * ```ts
 * import { createAgent } from '@univedge/locus-agent-sdk'
 *
 * // Provide a factory that creates your engine implementation
 * const agent = createAgent({ model: 'claude-sonnet-4-6', cwd: '/my/project' }, myEngineFactory)
 *
 * for await (const msg of agent.query('Summarise the README')) {
 *   if (msg.type === 'assistant') console.log(msg.message.content)
 * }
 * ```
 *
 * @module agent
 */

import type {
  AgentOptions,
  IQueryEngine,
  PermissionMode,
  QueryEngineConfig,
  QueryResult,
} from './runtime/query.js'
import type { CoreMessage } from './types/message.js'
import type { SDKMessage, SDKTokenUsage } from './types/sdk-message.js'
import process from 'node:process'

// ---------------------------------------------------------------------------
// Factory type — lets consumers inject their engine implementation
// ---------------------------------------------------------------------------

/**
 * Function that creates a concrete `IQueryEngine` from a resolved config.
 * Implementations are provider-specific (Vercel AI SDK, Anthropic SDK, etc.).
 */
export type QueryEngineFactory = (config: QueryEngineConfig) => IQueryEngine

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TURNS = 100
const DEFAULT_MAX_TOKENS = 8192

function resolveConfig(options: AgentOptions): QueryEngineConfig {
  return {
    cwd: options.cwd ?? process.cwd(),
    model: options.model ?? 'claude-sonnet-4-6',
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    tools: Array.isArray(options.tools)
      ? (options.tools as import('./types/tool.js').ToolDefinition[])
      : [],
    systemPrompt: typeof options.systemPrompt === 'string'
      ? options.systemPrompt
      : undefined,
    appendSystemPrompt: options.appendSystemPrompt,
    maxTurns: options.maxTurns ?? DEFAULT_MAX_TURNS,
    maxBudgetUsd: options.maxBudgetUsd,
    maxTokens: DEFAULT_MAX_TOKENS,
    thinking: options.thinking,
    effortLevel: options.effortLevel,
    jsonSchema: options.jsonSchema,
    canUseTool: options.canUseTool,
    permissionMode: options.permissionMode ?? 'default',
    includePartialMessages: options.includePartialMessages ?? false,
    abortSignal: options.abortSignal ?? options.abortController?.signal,
    agents: options.agents,
    env: options.env,
    debug: options.debug,
  }
}

// ---------------------------------------------------------------------------
// Agent class
// ---------------------------------------------------------------------------

export class Agent {
  private options: AgentOptions
  private factory: QueryEngineFactory
  private engine: IQueryEngine | null = null
  private sessionId: string

  constructor(options: AgentOptions, factory: QueryEngineFactory) {
    this.options = options
    this.factory = factory
    this.sessionId = options.sessionId ?? crypto.randomUUID()
  }

  private getEngine(): IQueryEngine {
    if (!this.engine) {
      this.engine = this.factory(resolveConfig(this.options))
    }
    return this.engine
  }

  /**
   * Stream a prompt through the agent loop.
   * Each yielded `SDKMessage` represents an incremental event.
   */
  async* query(
    prompt: string,
    overrides?: Partial<AgentOptions>,
  ): AsyncGenerator<SDKMessage> {
    if (overrides) {
      // Create a one-off engine with overridden config
      const merged = { ...this.options, ...overrides }
      const engine = this.factory(resolveConfig(merged))
      yield* engine.submitMessage(prompt)
      return
    }

    yield* this.getEngine().submitMessage(prompt)
  }

  /**
   * Convenience method: run a prompt and return the complete result.
   */
  async prompt(
    text: string,
    overrides?: Partial<AgentOptions>,
  ): Promise<QueryResult> {
    const start = Date.now()
    let finalText = ''
    let usage: SDKTokenUsage = { input_tokens: 0, output_tokens: 0 }
    let numTurns = 0

    for await (const msg of this.query(text, overrides)) {
      if (msg.type === 'result') {
        finalText = msg.result ?? finalText
        usage = msg.usage ?? usage
        numTurns = msg.num_turns ?? numTurns
      }
    }

    return {
      text: finalText,
      usage,
      numTurns,
      durationMs: Date.now() - start,
      messages: this.getMessages(),
    }
  }

  /** Return a copy of the current conversation history. */
  getMessages(): CoreMessage[] {
    return this.engine?.getMessages() ?? []
  }

  /** Clear conversation history and reset the engine. */
  clear(): void {
    this.engine = null
  }

  /** Interrupt any in-progress query (sets abort signal). */
  async interrupt(): Promise<void> {
    this.options.abortController?.abort()
    // Re-create controller for future queries
    this.options.abortController = new AbortController()
  }

  /** Change the model for subsequent queries. */
  setModel(model: string): void {
    this.options = { ...this.options, model }
    this.engine = null // Recreate engine with new model
  }

  /** Change the permission mode for subsequent queries. */
  setPermissionMode(mode: PermissionMode): void {
    this.options = { ...this.options, permissionMode: mode }
    this.engine = null
  }

  /** Get the session ID for this agent. */
  getSessionId(): string {
    return this.sessionId
  }

  /** Get accumulated token usage from the current engine. */
  getUsage(): SDKTokenUsage {
    return this.engine?.getUsage() ?? { input_tokens: 0, output_tokens: 0 }
  }

  /** Get estimated cost in USD from the current engine. */
  getCost(): number {
    return this.engine?.getCost() ?? 0
  }

  /** Clean up resources (call when done with this agent). */
  dispose(): void {
    this.engine = null
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a new `Agent` instance.
 *
 * @param options  Agent configuration (model, cwd, tools, etc.)
 * @param factory  Engine factory — creates the LLM engine from config
 */
export function createAgent(options: AgentOptions, factory: QueryEngineFactory): Agent {
  return new Agent(options, factory)
}

/**
 * One-shot query helper: create a temporary agent, run one prompt, return
 * the result stream. No session state is kept after the generator completes.
 */
export async function* query(
  params: { prompt: string, options?: AgentOptions },
  factory: QueryEngineFactory,
): AsyncGenerator<SDKMessage> {
  const opts = params.options ?? {}
  const config = resolveConfig(opts)
  const engine = factory(config)
  yield* engine.submitMessage(params.prompt)
}
