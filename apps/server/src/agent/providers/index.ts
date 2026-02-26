import type { LLMProviderType } from '@locus-agent/shared'
import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createMoonshotAI } from '@ai-sdk/moonshotai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { DEFAULT_MODELS, normalizeModelForProvider } from '@locus-agent/shared'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export type { LLMProviderType }

export interface LLMConfig {
  provider: LLMProviderType
  apiKey: string
  apiBase?: string
  model?: string
}

const DEFAULT_CONTEXT_WINDOW = 128_000
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const OPENROUTER_CONTEXT_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const OPENROUTER_REQUEST_TIMEOUT_MS = 10_000
const REFRESH_ERROR_LOG_THROTTLE_MS = 60_000
const MISSING_MODEL_LOG_THROTTLE_MS = 10 * 60 * 1000

interface OpenRouterModel {
  id: string
  context_length?: number | null
  top_provider?: {
    context_length?: number | null
  }
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[]
}

interface ContextWindowCatalog {
  byId: Map<string, number>
  bySlugMin: Map<string, number>
  fetchedAt: number
  expiresAt: number
}

let _config: LLMConfig | null = null
let contextWindowCatalog: ContextWindowCatalog | null = null
let refreshCatalogPromise: Promise<void> | null = null
let lastRefreshErrorLogAt = 0
const lastMissingModelLogAt = new Map<string, number>()

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase()
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return null
  const parsed = Math.floor(value)
  return parsed > 0 ? parsed : null
}

function buildLookupCandidates(modelId: string): string[] {
  const normalized = normalizeModelId(modelId)
  if (!normalized)
    return []

  const candidates = new Set<string>([normalized])

  if (normalized.includes(':')) {
    candidates.add(normalized.replaceAll(':', '/'))
  }

  const openRouterPrefix = 'openrouter/'
  if (normalized.startsWith(openRouterPrefix)) {
    candidates.add(normalized.slice(openRouterPrefix.length))
  }

  for (const candidate of [...candidates]) {
    let current = candidate
    while (true) {
      const relaxed = current.replace(/\.\d+$/, '')
      if (!relaxed || relaxed === current)
        break
      candidates.add(relaxed)
      current = relaxed
    }
  }

  for (const candidate of [...candidates]) {
    const segments = candidate.split('/').filter(Boolean)
    if (segments.length > 1) {
      const slug = segments[segments.length - 1]
      const authorAndSlug = segments.slice(-2).join('/')
      candidates.add(slug)
      candidates.add(authorAndSlug)
    }
  }

  return [...candidates]
}

async function fetchOpenRouterContextCatalog(): Promise<ContextWindowCatalog> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_REQUEST_TIMEOUT_MS)

  try {
    const headers: HeadersInit = { Accept: 'application/json' }
    if (_config?.provider === 'openrouter' && _config.apiKey) {
      headers.Authorization = `Bearer ${_config.apiKey}`
    }

    const response = await fetch(OPENROUTER_MODELS_URL, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`OpenRouter models request failed: ${response.status}`)
    }

    const payload = await response.json() as OpenRouterModelsResponse
    const models = Array.isArray(payload.data) ? payload.data : []

    const byId = new Map<string, number>()
    const bySlugMin = new Map<string, number>()

    for (const model of models) {
      const normalizedId = normalizeModelId(model.id)
      if (!normalizedId)
        continue

      const contextLength
        = parsePositiveInteger(model.context_length)
          ?? parsePositiveInteger(model.top_provider?.context_length)
      if (contextLength === null)
        continue

      byId.set(normalizedId, contextLength)

      const slug = normalizedId.split('/').filter(Boolean).pop()
      if (!slug)
        continue

      const existing = bySlugMin.get(slug)
      if (existing === undefined || contextLength < existing) {
        bySlugMin.set(slug, contextLength)
      }
    }

    const fetchedAt = Date.now()
    return {
      byId,
      bySlugMin,
      fetchedAt,
      expiresAt: fetchedAt + OPENROUTER_CONTEXT_CACHE_TTL_MS,
    }
  }
  finally {
    clearTimeout(timeout)
  }
}

function shouldRefreshCatalog(now: number): boolean {
  if (!contextWindowCatalog)
    return true
  return contextWindowCatalog.expiresAt <= now
}

function logRefreshError(error: unknown): void {
  const now = Date.now()
  if (now - lastRefreshErrorLogAt < REFRESH_ERROR_LOG_THROTTLE_MS)
    return

  lastRefreshErrorLogAt = now
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[providers] Failed to refresh OpenRouter model catalog: ${message}`)
}

function triggerCatalogRefresh(force = false): void {
  const now = Date.now()
  if (!force && !shouldRefreshCatalog(now))
    return
  if (refreshCatalogPromise)
    return

  refreshCatalogPromise = fetchOpenRouterContextCatalog()
    .then((catalog) => {
      contextWindowCatalog = catalog
    })
    .catch((error) => {
      logRefreshError(error)
    })
    .finally(() => {
      refreshCatalogPromise = null
    })
}

function resolveContextWindowFromCatalog(modelId: string): number | null {
  if (!contextWindowCatalog)
    return null

  const candidates = buildLookupCandidates(modelId)
  if (candidates.length === 0)
    return null

  for (const candidate of candidates) {
    const direct = contextWindowCatalog.byId.get(candidate)
    if (direct !== undefined)
      return direct
  }

  for (const candidate of candidates) {
    const slug = candidate.split('/').filter(Boolean).pop()
    if (!slug)
      continue
    const slugMatch = contextWindowCatalog.bySlugMin.get(slug)
    if (slugMatch !== undefined)
      return slugMatch
  }

  return null
}

function logMissingModelLookup(modelId: string): void {
  const normalized = normalizeModelId(modelId)
  if (!normalized)
    return

  const now = Date.now()
  const last = lastMissingModelLogAt.get(normalized) ?? 0
  if (now - last < MISSING_MODEL_LOG_THROTTLE_MS)
    return

  lastMissingModelLogAt.set(normalized, now)
  console.warn(`[providers] Context window not found in OpenRouter catalog for model "${normalized}", using default ${DEFAULT_CONTEXT_WINDOW}`)
}

/**
 * Get context window size for a model
 * Uses OpenRouter model catalog with a safe fallback.
 */
export function getModelContextWindow(modelId: string): number {
  triggerCatalogRefresh()

  const resolved = resolveContextWindowFromCatalog(modelId)
  if (resolved !== null)
    return resolved

  if (contextWindowCatalog) {
    logMissingModelLookup(modelId)
  }
  return DEFAULT_CONTEXT_WINDOW
}

/**
 * Inject LLM config (called at startup by both CLI and dev mode)
 */
export function setLLMConfig(config: LLMConfig): void {
  _config = config
  triggerCatalogRefresh()
}

function getConfig(): LLMConfig {
  if (_config)
    return _config
  throw new Error('LLM config not initialized. Run `locus-agent config` to set up.')
}

export function getDefaultModel(): string {
  const cfg = getConfig()
  return cfg.model || DEFAULT_MODELS[cfg.provider]
}

/**
 * Get current model information including context window size
 */
export function getCurrentModelInfo(): {
  provider: LLMProviderType
  model: string
  contextWindow: number
} {
  const cfg = getConfig()
  const model = cfg.model || DEFAULT_MODELS[cfg.provider]
  return {
    provider: cfg.provider,
    model,
    contextWindow: getModelContextWindow(model),
  }
}

/**
 * Default base URLs
 */
const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  moonshotai: 'https://api.moonshot.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

/**
 * Create model instance for the configured provider.
 * @param modelId Model identifier
 * @param thinkingMode When set, some providers auto-switch between chat/reasoner variants
 */
export function createLLMModel(
  modelId: string = getDefaultModel(),
  thinkingMode?: boolean,
): LanguageModel {
  const cfg = getConfig()
  const baseURL = cfg.apiBase || PROVIDER_DEFAULT_BASE_URLS[cfg.provider]
  let effectiveModelId = normalizeModelForProvider(modelId, cfg.provider)

  switch (cfg.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return anthropic(effectiveModelId)
    }
    case 'deepseek': {
      if (thinkingMode !== undefined) {
        const isReasoner = effectiveModelId.includes('reasoner')
        effectiveModelId = thinkingMode && !isReasoner
          ? 'deepseek-reasoner'
          : !thinkingMode && isReasoner
            ? 'deepseek-chat'
            : effectiveModelId
      }
      const deepseek = createDeepSeek({
        apiKey: cfg.apiKey,
        baseURL: baseURL || 'https://api.deepseek.com',
      })
      return deepseek.chat(effectiveModelId)
    }
    case 'moonshotai': {
      const moonshot = createMoonshotAI({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return moonshot(effectiveModelId)
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return openrouter(effectiveModelId)
    }
    case 'openai':
    default: {
      // 自定义 baseURL 时使用 openai-compatible，避免 OpenAI 专有的 Responses API 和 thinking 验证
      if (baseURL) {
        const provider = createOpenAICompatible({
          name: 'custom-openai',
          apiKey: cfg.apiKey,
          baseURL,
        })
        return provider.chatModel(effectiveModelId)
      }
      const openai = createOpenAI({ apiKey: cfg.apiKey })
      return openai(effectiveModelId)
    }
  }
}
