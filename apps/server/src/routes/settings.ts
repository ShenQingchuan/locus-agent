import type { LLMProviderType } from '../agent/providers/index.js'
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

async function buildConfigResponse(): Promise<{
  setupCompleted: boolean
  provider: LLMProviderType
  hasApiKey: boolean
  apiKeyMasked: string | null
  apiBase?: string
  model?: string
  port: number
  runtime?: { provider: string, model: string, contextWindow: number }
}> {
  const keys = [
    'setup.completed',
    'llm.provider',
    'llm.api_key',
    'llm.api_base',
    'llm.model',
    'server.port',
  ]
  const map = await getSettingsMap(keys)

  const provider = (map['llm.provider'] || 'openai') as LLMProviderType
  const apiKey = map['llm.api_key']
  const apiBase = map['llm.api_base']
  const model = map['llm.model']
  const port = Number(map['server.port']) || 3000

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
    apiBase: apiBase || undefined,
    model: model || undefined,
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
  provider: z.enum(['openai', 'anthropic', 'moonshotai']).optional(),
  apiKey: z.string().optional(),
  apiBase: z.union([z.string(), z.null()]).optional(),
  model: z.union([z.string(), z.null()]).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
})

/**
 * PUT /api/settings/config - Update persisted config and apply runtime LLM config
 */
settingsRoutes.put('/config', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = updateConfigSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        message: 'Invalid settings payload',
        issues: parsed.error.issues,
      },
      400,
    )
  }

  try {
    const keys = ['llm.provider', 'llm.api_key', 'llm.api_base', 'llm.model', 'server.port']
    const map = await getSettingsMap(keys)

    const currentProvider = (map['llm.provider'] || 'openai') as LLMProviderType
    const currentApiKey = map['llm.api_key']
    const currentApiBase = map['llm.api_base']
    const currentModel = map['llm.model']
    const currentPort = Number(map['server.port']) || 3000

    const nextProvider = (parsed.data.provider || currentProvider) as LLMProviderType

    const nextApiKey = (() => {
      if (parsed.data.apiKey === undefined)
        return currentApiKey
      const trimmed = parsed.data.apiKey.trim()
      return trimmed.length > 0 ? trimmed : currentApiKey
    })()

    if (!nextApiKey) {
      return c.json(
        {
          success: false,
          message: 'API key is required',
        },
        400,
      )
    }

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

    const nextPort = parsed.data.port ?? currentPort

    // Persist settings
    await upsertSetting('setup.completed', 'true')
    await upsertSetting('llm.provider', nextProvider)
    await upsertSetting('llm.api_key', nextApiKey)

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

    if (parsed.data.port !== undefined) {
      await upsertSetting('server.port', String(nextPort))
    }

    // Apply runtime LLM config
    setLLMConfig({
      provider: nextProvider,
      apiKey: nextApiKey,
      apiBase: nextApiBase,
      model: nextModel,
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
