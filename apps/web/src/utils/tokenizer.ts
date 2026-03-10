import type { Tiktoken, TiktokenEncoding, TiktokenModel } from 'js-tiktoken'

const DEFAULT_ENCODING: TiktokenEncoding = 'o200k_base'
const encoderCache = new Map<string, Tiktoken>()
const FALLBACK_ENCODER_CACHE_KEY = `encoding:${DEFAULT_ENCODING}`

// 延迟加载 js-tiktoken (~5MB)，避免阻塞首屏
let tiktokenModule: typeof import('js-tiktoken') | null = null
const tiktokenReady = import('js-tiktoken').then((m) => {
  tiktokenModule = m
})

function normalizeModelHint(modelHint?: string): string | undefined {
  if (!modelHint)
    return undefined

  const trimmed = modelHint.trim()
  if (!trimmed)
    return undefined

  const parts = trimmed.split('/')
  return parts.at(-1)
}

function getEncoder(modelHint?: string): Tiktoken | null {
  if (!tiktokenModule)
    return null

  const normalizedModel = normalizeModelHint(modelHint)
  if (normalizedModel) {
    const modelCacheKey = `model:${normalizedModel}`
    const cachedByModel = encoderCache.get(modelCacheKey)
    if (cachedByModel)
      return cachedByModel

    try {
      const encoder = tiktokenModule.encodingForModel(normalizedModel as TiktokenModel)
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

  const fallbackEncoder = tiktokenModule.getEncoding(DEFAULT_ENCODING)
  encoderCache.set(FALLBACK_ENCODER_CACHE_KEY, fallbackEncoder)
  return fallbackEncoder
}

// tiktoken 未加载时使用近似估算 (1 token ≈ 4 chars)
function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

export function countTextTokens(text: string, modelHint?: string): number {
  if (!text)
    return 0
  const encoder = getEncoder(modelHint)
  return encoder ? encoder.encode(text).length : approximateTokenCount(text)
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

/**
 * 等待 tiktoken 加载完成后的 Promise，
 * 调用方可在 ready 后重新计算 token 数以获取精确值
 */
export { tiktokenReady }
