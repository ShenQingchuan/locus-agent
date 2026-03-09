import type { CustomProviderMode, LLMProviderType } from '@locus-agent/agent-sdk'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { settings as settingsTable } from '../db/schema.js'

export { ensureDataDir, getDataDir, getSettingsDbPath, getSkillsDataDir } from './paths.js'

export function getSetting(key: string): string | undefined {
  const rows = db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1)
    .all()

  return rows[0]?.value
}

export function setSetting(key: string, value: string): void {
  const existing = db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1)
    .all()

  if (existing.length > 0) {
    db.update(settingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(settingsTable.key, key))
      .run()
  }
  else {
    db.insert(settingsTable)
      .values({ key, value })
      .run()
  }
}

export function isSetupComplete(): boolean {
  return getSetting('setup.completed') === 'true'
}

export interface LLMSettings {
  provider: LLMProviderType
  apiKey: string
  apiBase?: string
  model?: string
  customMode?: CustomProviderMode
}

export function getLLMSettings(): LLMSettings | null {
  const provider = (getSetting('llm.provider') || 'openai') as LLMSettings['provider']
  const apiKey = getSetting(`llm.api_key.${provider}`)
  if (!apiKey)
    return null
  return {
    provider,
    apiKey,
    apiBase: getSetting('llm.api_base') || undefined,
    model: getSetting('llm.model') || undefined,
    customMode: (getSetting('llm.custom_mode') as CustomProviderMode) || undefined,
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  setSetting('llm.provider', settings.provider)
  // Only persist non-empty API keys to avoid corrupting the DB state
  if (settings.apiKey)
    setSetting(`llm.api_key.${settings.provider}`, settings.apiKey)
  if (settings.apiBase)
    setSetting('llm.api_base', settings.apiBase)
  if (settings.model)
    setSetting('llm.model', settings.model)
  if (settings.customMode)
    setSetting('llm.custom_mode', settings.customMode)
  setSetting('setup.completed', 'true')
}

export function getServerPort(): number {
  return Number(getSetting('server.port')) || 3000
}

export function isYoloMode(): boolean {
  return getSetting('server.yolo_mode') === 'true'
}

// ---------------------------------------------------------------------------
// Coding provider settings (Kimi Code)
// ---------------------------------------------------------------------------

export interface CodingSettings {
  kimiCode: {
    apiKey: string
    apiBase: string
    model: string
  }
}

export function getCodingSettings(): CodingSettings {
  return {
    kimiCode: {
      apiKey: getSetting('coding.kimi.api_key') || '',
      apiBase: getSetting('coding.kimi.api_base') || 'https://api.kimi.com/coding/v1',
      model: getSetting('coding.kimi.model') || 'kimi-k2.5',
    },
  }
}

export function saveKimiCodeSettings(settings: { apiKey?: string, apiBase?: string, model?: string }): void {
  if (settings.apiKey !== undefined)
    setSetting('coding.kimi.api_key', settings.apiKey)
  if (settings.apiBase !== undefined)
    setSetting('coding.kimi.api_base', settings.apiBase)
  if (settings.model !== undefined)
    setSetting('coding.kimi.model', settings.model)
}
