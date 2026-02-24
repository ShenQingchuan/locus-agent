import type { Tiktoken, TiktokenEncoding, TiktokenModel } from 'js-tiktoken'
import { encodingForModel, getEncoding } from 'js-tiktoken'

const DEFAULT_ENCODING: TiktokenEncoding = 'o200k_base'
const encoderCache = new Map<string, Tiktoken>()
const FALLBACK_ENCODER_CACHE_KEY = `encoding:${DEFAULT_ENCODING}`

function normalizeModelHint(modelHint?: string): string | undefined {
  if (!modelHint)
    return undefined

  const trimmed = modelHint.trim()
  if (!trimmed)
    return undefined

  const parts = trimmed.split('/')
  return parts[parts.length - 1]
}

function getEncoder(modelHint?: string): Tiktoken {
  const normalizedModel = normalizeModelHint(modelHint)
  if (normalizedModel) {
    const modelCacheKey = `model:${normalizedModel}`
    const cachedByModel = encoderCache.get(modelCacheKey)
    if (cachedByModel)
      return cachedByModel

    try {
      const encoder = encodingForModel(normalizedModel as TiktokenModel)
      encoderCache.set(modelCacheKey, encoder)
      return encoder
    }
    catch {
      // Fall through to generic fallback encoding.
    }
  }

  const cachedFallback = encoderCache.get(FALLBACK_ENCODER_CACHE_KEY)
  if (cachedFallback)
    return cachedFallback

  const fallbackEncoder = getEncoding(DEFAULT_ENCODING)
  encoderCache.set(FALLBACK_ENCODER_CACHE_KEY, fallbackEncoder)
  return fallbackEncoder
}

export function countTextTokens(text: string, modelHint?: string): number {
  if (!text)
    return 0
  return getEncoder(modelHint).encode(text).length
}

export function countUnknownTokens(value: unknown, modelHint?: string): number {
  if (value === null || value === undefined)
    return 0
  if (typeof value === 'string')
    return countTextTokens(value, modelHint)

  try {
    return countTextTokens(JSON.stringify(value), modelHint)
  }
  catch {
    return 0
  }
}
