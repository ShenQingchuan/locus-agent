import type { CustomProviderMode, LLMProviderType } from '../agent/providers/index.js'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  getCurrentModelInfo,

  setLLMConfig,
} from '../agent/providers/index.js'
import { db, settings as settingsTable } from '../db/index.js'

export const settingsRoutes = new Hono()

/**
 * GET /api/settings - Get current LLM settings including model context window
 */
settingsRoutes.get('/', (c) => {
  try {
    const modelInfo = getCurrentModelInfo()
    return c.json({
      provider: modelInfo.provider,
      model: modelInfo.model,
      contextWindow: modelInfo.contextWindow,
    })
  }
  catch (error) {
    return c.json(
      {
        error: 'Failed to get settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
})

function maskApiKey(apiKey: string): string {
  const key = apiKey.trim()
  const prefixLen = 6
  const suffixLen = 3

  if (!key)
    return '***'

  // Short keys still should not be fully revealed.
  if (key.length <= prefixLen + suffixLen) {
    const prefix = key.slice(0, Math.min(2, key.length))
    const suffix = key.length > 2 ? key.slice(-1) : ''
    return `${prefix}***${suffix}`
  }

  return `${key.slice(0, prefixLen)}***${key.slice(-suffixLen)}`
}

async function getSettingsMap(keys: string[]): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(inArray(settingsTable.key, keys))

  const map: Record<string, string> = {}
  for (const row of rows) {
    map[row.key] = row.value
  }
  return map
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const existing = await db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(settingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(settingsTable.key, key))
    return
  }

  await db.insert(settingsTable).values({ key, value })
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(settingsTable).where(eq(settingsTable.key, key))
}

const ALL_PROVIDERS: LLMProviderType[] = ['openai', 'anthropic', 'moonshotai', 'openrouter', 'deepseek', 'custom']

async function buildConfigResponse(): Promise<{
  setupCompleted: boolean
  provider: LLMProviderType
  hasApiKey: boolean
  apiKeyMasked: string | null
  apiKeys: Partial<Record<LLMProviderType, string | null>>
  apiBase?: string
  model?: string
  customMode?: CustomProviderMode
  port: number
  runtime?: { provider: string, model: string, contextWindow: number }
}> {
  const keys = [
    'setup.completed',
    'llm.provider',
    'llm.api_base',
    'llm.model',
    'llm.custom_mode',
    'server.port',
    ...ALL_PROVIDERS.map(p => `llm.api_key.${p}`),
  ]
  const map = await getSettingsMap(keys)

  const provider = (map['llm.provider'] || 'openai') as LLMProviderType
  const apiKey = map[`llm.api_key.${provider}`]
  const apiBase = map['llm.api_base']
  const model = map['llm.model']
  const customMode = (map['llm.custom_mode'] as CustomProviderMode) || undefined
  const port = Number(map['server.port']) || 3000

  // Build per-provider masked keys map
  const apiKeys: Partial<Record<LLMProviderType, string | null>> = {}
  for (const p of ALL_PROVIDERS) {
    const key = map[`llm.api_key.${p}`]
    apiKeys[p] = key ? maskApiKey(key) : null
  }

  let runtime: { provider: string, model: string, contextWindow: number } | undefined
  try {
    runtime = getCurrentModelInfo()
  }
  catch {
    runtime = undefined
  }

  return {
    setupCompleted: map['setup.completed'] === 'true',
    provider,
    hasApiKey: !!apiKey,
    apiKeyMasked: apiKey ? maskApiKey(apiKey) : null,
    apiKeys,
    apiBase: apiBase || undefined,
    model: model || undefined,
    customMode,
    port,
    runtime,
  }
}

/**
 * GET /api/settings/config - Get persisted config (masked)
 */
settingsRoutes.get('/config', async (c) => {
  try {
    const config = await buildConfigResponse()
    return c.json(config)
  }
  catch (error) {
    return c.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
})

const updateConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'moonshotai', 'openrouter', 'deepseek', 'custom']).optional(),
  apiKey: z.string().optional(),
  apiBase: z.union([z.string(), z.null()]).optional(),
  model: z.union([z.string(), z.null()]).optional(),
  customMode: z.enum(['openai-compatible', 'anthropic-compatible']).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
})

/**
 * PUT /api/settings/config - Update persisted config and apply runtime LLM config
 */
settingsRoutes.put('/config', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = updateConfigSchema.safeParse(json)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const hint = firstIssue
      ? `（${firstIssue.path.join('.')}: ${firstIssue.message}）`
      : ''
    return c.json(
      {
        success: false,
        message: `请求参数格式错误${hint}`,
        issues: parsed.error.issues,
      },
      400,
    )
  }

  try {
    const keys = [
      'llm.provider',
      'llm.api_base',
      'llm.model',
      'llm.custom_mode',
      'server.port',
      ...ALL_PROVIDERS.map(p => `llm.api_key.${p}`),
    ]
    const map = await getSettingsMap(keys)

    const currentProvider = (map['llm.provider'] || 'openai') as LLMProviderType
    const currentApiBase = map['llm.api_base']
    const currentModel = map['llm.model']
    const currentCustomMode = (map['llm.custom_mode'] as CustomProviderMode) || undefined
    const currentPort = Number(map['server.port']) || 3000

    const nextProvider = (parsed.data.provider || currentProvider) as LLMProviderType

    const currentProviderKey = map[`llm.api_key.${nextProvider}`]

    const nextApiKey = (() => {
      if (parsed.data.apiKey === undefined)
        return currentProviderKey ?? ''
      const trimmed = parsed.data.apiKey.trim()
      return trimmed.length > 0 ? trimmed : (currentProviderKey ?? '')
    })()

    const nextApiBase = (() => {
      if (parsed.data.apiBase === undefined) {
        return currentApiBase || undefined
      }
      const raw = parsed.data.apiBase ?? ''
      const trimmed = raw.trim()
      return trimmed.length > 0 ? trimmed : undefined
    })()

    const nextModel = (() => {
      if (parsed.data.model === undefined) {
        return currentModel || undefined
      }
      const raw = parsed.data.model ?? ''
      const trimmed = raw.trim()
      return trimmed.length > 0 ? trimmed : undefined
    })()

    const nextCustomMode = parsed.data.customMode || currentCustomMode
    const nextPort = parsed.data.port ?? currentPort

    // Persist settings
    await upsertSetting('setup.completed', 'true')
    await upsertSetting('llm.provider', nextProvider)
    await upsertSetting(`llm.api_key.${nextProvider}`, nextApiKey)

    if (parsed.data.apiBase !== undefined) {
      if (nextApiBase)
        await upsertSetting('llm.api_base', nextApiBase)
      else await deleteSetting('llm.api_base')
    }

    if (parsed.data.model !== undefined) {
      if (nextModel)
        await upsertSetting('llm.model', nextModel)
      else await deleteSetting('llm.model')
    }

    if (parsed.data.customMode !== undefined) {
      if (nextCustomMode)
        await upsertSetting('llm.custom_mode', nextCustomMode)
      else await deleteSetting('llm.custom_mode')
    }

    if (parsed.data.port !== undefined) {
      await upsertSetting('server.port', String(nextPort))
    }

    // Apply runtime LLM config
    setLLMConfig({
      provider: nextProvider,
      apiKey: nextApiKey,
      apiBase: nextApiBase,
      model: nextModel,
      customMode: nextCustomMode,
    })

    const requiresRestart = parsed.data.port !== undefined && nextPort !== currentPort

    return c.json({
      success: true,
      requiresRestart,
      config: await buildConfigResponse(),
    })
  }
  catch (error) {
    return c.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
})
