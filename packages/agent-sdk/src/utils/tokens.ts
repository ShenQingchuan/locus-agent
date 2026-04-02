/**
 * Token Estimation & Model Pricing
 *
 * Rough token estimation (character-based) and cost calculation.
 * Suitable for client and server use — no SDK dependencies.
 */

import type { CoreMessage } from '../types/message.js'

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

/** Rough estimate: ~4 chars per token (conservative). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Estimate tokens for a CoreMessage array. */
export function estimateMessagesTokens(messages: CoreMessage[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content))
  }
  return total
}

/** Estimate tokens for a system prompt string. */
export function estimateSystemPromptTokens(systemPrompt: string): number {
  return estimateTokens(systemPrompt)
}

// ---------------------------------------------------------------------------
// Context window
// ---------------------------------------------------------------------------

/** Get the context window size (in tokens) for a given model. */
export function getContextWindowSize(model: string): number {
  if (model.includes('opus-4') && model.includes('1m'))
    return 1_000_000
  if (model.includes('opus-4') || model.includes('sonnet-4') || model.includes('haiku-4'))
    return 200_000
  if (model.includes('claude-3'))
    return 200_000
  return 200_000
}

/**
 * Buffer (tokens) before the context limit at which auto-compaction fires.
 * Matches the threshold used by Claude Code.
 */
export const AUTOCOMPACT_BUFFER_TOKENS = 13_000

/** Threshold at which auto-compaction should be triggered for a model. */
export function getAutoCompactThreshold(model: string): number {
  return getContextWindowSize(model) - AUTOCOMPACT_BUFFER_TOKENS
}

// ---------------------------------------------------------------------------
// Pricing & cost
// ---------------------------------------------------------------------------

/** Model pricing table (USD per token). */
export const MODEL_PRICING: Record<string, { input: number, output: number }> = {
  'claude-opus-4-6': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-opus-4-5': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  'claude-sonnet-4-6': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-sonnet-4-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-haiku-4-5': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  'claude-3-5-sonnet': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-3-5-haiku': { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
  'claude-3-opus': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
}

/** Estimate cost in USD given a model and token usage. */
export function estimateCost(
  model: string,
  usage: { input_tokens: number, output_tokens: number },
): number {
  const pricing
    = Object.entries(MODEL_PRICING).find(([key]) => model.includes(key))?.[1]
    ?? { input: 3 / 1_000_000, output: 15 / 1_000_000 }

  return usage.input_tokens * pricing.input + usage.output_tokens * pricing.output
}

/** Sum all token counts from an API usage object (including cache tokens). */
export function getTotalTokenCount(usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}): number {
  return (
    usage.input_tokens
    + usage.output_tokens
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0)
  )
}
