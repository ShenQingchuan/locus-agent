/**
 * SDK Message types for streaming agent responses.
 *
 * These types define the streaming event model used by Agent.query() and
 * QueryEngine.submitMessage(). They are designed to be compatible with the
 * Anthropic Claude API response format while remaining dependency-free.
 *
 * @module types/sdk-message
 */

import type { TokenUsage } from '../runtime/agent-loop.js'

// --------------------------------------------------------------------------
// Content Block Types (Anthropic API compatible, dependency-free)
// --------------------------------------------------------------------------

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking: string
}

/** Content blocks that may appear in assistant messages. */
export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock

// --------------------------------------------------------------------------
// SDK Token Usage (Anthropic API format, snake_case)
// --------------------------------------------------------------------------

/**
 * Token usage in Anthropic API response format.
 * For Vercel AI SDK format (camelCase), see {@link TokenUsage} from runtime.
 */
export interface SDKTokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/** Convert SDK (snake_case) usage to runtime (camelCase) usage. */
export function toRuntimeUsage(sdk: SDKTokenUsage): TokenUsage {
  return {
    inputTokens: sdk.input_tokens,
    outputTokens: sdk.output_tokens,
    totalTokens: sdk.input_tokens + sdk.output_tokens,
  }
}

/** Convert runtime (camelCase) usage to SDK (snake_case) usage. */
export function toSDKUsage(runtime: TokenUsage): SDKTokenUsage {
  return {
    input_tokens: runtime.inputTokens,
    output_tokens: runtime.outputTokens,
  }
}

// --------------------------------------------------------------------------
// SDK Message Union
// --------------------------------------------------------------------------

/**
 * Union of all streaming message types yielded by `Agent.query()` and
 * `QueryEngine.submitMessage()`.
 *
 * Consumers should switch on the `type` field, and for `type: 'system'`
 * additionally switch on `subtype`.
 */
export type SDKMessage
  = | SDKAssistantMessage
    | SDKToolResultMessage
    | SDKResultMessage
    | SDKPartialMessage
    | SDKSystemMessage

/**
 * Discriminated union of system message subtypes.
 * Separated so consumers can narrow `SDKSystemMessage` further by `subtype`.
 */
export type SDKSystemMessage
  = | SDKInitMessage
    | SDKCompactBoundaryMessage
    | SDKStatusMessage
    | SDKTaskNotificationMessage
    | SDKRateLimitMessage

// --------------------------------------------------------------------------
// Individual SDK Message Types
// --------------------------------------------------------------------------

/** Full assistant message with content blocks (emitted after each API turn). */
export interface SDKAssistantMessage {
  type: 'assistant'
  uuid?: string
  session_id?: string
  message: {
    role: 'assistant'
    content: ContentBlock[]
  }
  parent_tool_use_id?: string | null
}

/** Tool execution result. */
export interface SDKToolResultMessage {
  type: 'tool_result'
  result: {
    tool_use_id: string
    tool_name: string
    output: string
  }
}

/** Final result marking the end of a query. */
export interface SDKResultMessage {
  type: 'result'
  subtype:
    | 'success'
    | 'error_max_turns'
    | 'error_during_execution'
    | 'error_max_budget_usd'
    | (string & {})
  uuid?: string
  session_id?: string
  is_error?: boolean
  num_turns?: number
  result?: string
  stop_reason?: string | null
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  usage?: SDKTokenUsage
  model_usage?: Record<string, { input_tokens: number, output_tokens: number }>
  permission_denials?: Array<{ tool: string, reason: string }>
  structured_output?: unknown
  errors?: string[]
}

/** Streaming partial content (text or tool_use in progress). */
export interface SDKPartialMessage {
  type: 'partial_message'
  partial: {
    type: 'text' | 'tool_use'
    text?: string
    name?: string
    input?: string
  }
}

/** Session initialization info (emitted once at session start). */
export interface SDKInitMessage {
  type: 'system'
  subtype: 'init'
  uuid?: string
  session_id: string
  tools: string[]
  model: string
  cwd: string
  mcp_servers: Array<{ name: string, status: string }>
  permission_mode: string
}

/** Marks a compaction boundary in the conversation history. */
export interface SDKCompactBoundaryMessage {
  type: 'system'
  subtype: 'compact_boundary'
  summary?: string
}

/** Status update during long-running operations. */
export interface SDKStatusMessage {
  type: 'system'
  subtype: 'status'
  message: string
}

/** Task lifecycle notification. */
export interface SDKTaskNotificationMessage {
  type: 'system'
  subtype: 'task_notification'
  task_id: string
  status: string
  message?: string
}

/** Rate limit event with optional retry delay. */
export interface SDKRateLimitMessage {
  type: 'system'
  subtype: 'rate_limit'
  retry_after_ms?: number
  message: string
}

// --------------------------------------------------------------------------
// Type Guards
// --------------------------------------------------------------------------

export function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant'
}

export function isToolResultMessage(msg: SDKMessage): msg is SDKToolResultMessage {
  return msg.type === 'tool_result'
}

export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result'
}

export function isPartialMessage(msg: SDKMessage): msg is SDKPartialMessage {
  return msg.type === 'partial_message'
}

export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === 'system'
}

/** Extract the final text from an SDKResultMessage. */
export function extractResultText(msg: SDKResultMessage): string {
  return msg.result ?? ''
}

/** Extract text content from an SDKAssistantMessage. */
export function extractAssistantText(msg: SDKAssistantMessage): string {
  return msg.message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

/** Extract tool_use blocks from an SDKAssistantMessage. */
export function extractToolUseBlocks(msg: SDKAssistantMessage): ToolUseBlock[] {
  return msg.message.content.filter((b): b is ToolUseBlock => b.type === 'tool_use')
}
