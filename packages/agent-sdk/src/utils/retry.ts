/**
 * Retry Logic with Exponential Backoff
 *
 * Handles API retries for rate limits, overloaded servers,
 * and transient failures. Browser and Node.js compatible.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatusCodes: number[]
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,
  maxDelayMs: 30_000,
  retryableStatusCodes: [429, 500, 502, 503, 529],
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export function isRetryableError(err: any, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (err?.status && config.retryableStatusCodes.includes(err.status))
    return true
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ECONNREFUSED')
    return true
  if (err?.error?.type === 'overloaded_error')
    return true
  return false
}

export function isPromptTooLongError(err: any): boolean {
  if (err?.status === 400) {
    const message: string = err?.error?.error?.message ?? err?.message ?? ''
    return (
      message.includes('prompt is too long')
      || message.includes('max_tokens')
      || message.includes('context length')
    )
  }
  return false
}

export function isAuthError(err: any): boolean {
  return err?.status === 401 || err?.status === 403
}

export function isRateLimitError(err: any): boolean {
  return err?.status === 429
}

// ---------------------------------------------------------------------------
// Backoff calculation
// ---------------------------------------------------------------------------

/** Exponential backoff delay with ±25% jitter. */
export function getRetryDelay(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = config.baseDelayMs * Math.pow(2, attempt)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.min(delay + jitter, config.maxDelayMs)
}

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

/** Execute a function with automatic retries on transient errors. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  abortSignal?: AbortSignal,
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (abortSignal?.aborted)
      throw new Error('Aborted')

    try {
      return await fn()
    }
    catch (err: any) {
      lastError = err

      if (!isRetryableError(err, config) || attempt === config.maxRetries)
        throw err

      const delay = getRetryDelay(attempt, config)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

export function formatApiError(err: any): string {
  if (isAuthError(err))
    return 'Authentication failed. Check your API key.'
  if (isRateLimitError(err))
    return 'Rate limit exceeded. Please retry after a short wait.'
  if (err?.status === 529)
    return 'API overloaded. Please retry later.'
  if (isPromptTooLongError(err))
    return 'Prompt too long. Auto-compacting conversation...'
  return `API error: ${err?.message ?? err}`
}
