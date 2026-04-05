import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_RETRY_CONFIG, getRetryDelay, withRetry } from './retry'

describe('withRetry', () => {
  it('should return result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry and eventually succeed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const retryableError = { status: 429 }
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValue('success')

    const result = await withRetry(fn, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 1, maxRetries: 3 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
    vi.restoreAllMocks()
  })

  it('should throw last error when all retries exhausted', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const retryableError = { status: 500, message: 'server error' }
    const fn = vi.fn().mockRejectedValue(retryableError)

    await expect(withRetry(fn, { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 1, maxRetries: 2 })).rejects.toEqual(retryableError)
    expect(fn).toHaveBeenCalledTimes(3)
    vi.restoreAllMocks()
  })
})

describe('getRetryDelay', () => {
  it('should calculate exponential backoff with jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const delay0 = getRetryDelay(0, DEFAULT_RETRY_CONFIG)
    expect(delay0).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs)

    const delay1 = getRetryDelay(1, DEFAULT_RETRY_CONFIG)
    expect(delay1).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs * 2)

    const delay2 = getRetryDelay(2, DEFAULT_RETRY_CONFIG)
    expect(delay2).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs * 4)

    vi.restoreAllMocks()
  })

  it('should cap delay at maxDelayMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1)
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 20_000, maxDelayMs: 30_000 }
    const delay = getRetryDelay(1, config)
    expect(delay).toBe(30_000)
    vi.restoreAllMocks()
  })

  it('should apply jitter within ±25% range', () => {
    const config = { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 1000 }
    const randomSpy = vi.spyOn(Math, 'random')

    randomSpy.mockReturnValue(0)
    const minDelay = getRetryDelay(0, config)
    expect(minDelay).toBe(750)

    randomSpy.mockReturnValue(1)
    const maxDelay = getRetryDelay(0, config)
    expect(maxDelay).toBe(1250)

    vi.restoreAllMocks()
  })
})
