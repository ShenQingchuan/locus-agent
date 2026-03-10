import { getProviderConfigOrNull } from './config-store.js'

const RE_TRAILING_DOT_DIGITS = /\.\d+$/

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
      const relaxed = current.replace(RE_TRAILING_DOT_DIGITS, '')
      if (!relaxed || relaxed === current)
        break
      candidates.add(relaxed)
      current = relaxed
    }
  }

  for (const candidate of [...candidates]) {
    const segments = candidate.split('/').filter(Boolean)
    if (segments.length > 1) {
      const slug = segments.at(-1)!
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
    const cfg = getProviderConfigOrNull()
    if (cfg?.provider === 'openrouter' && cfg.apiKey) {
      headers.Authorization = `Bearer ${cfg.apiKey}`
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

export function triggerCatalogRefresh(force = false): void {
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
