import type { LLMProviderType } from '@locus-agent/shared'
import { eq } from 'drizzle-orm'
import { db, settings as settingsTable } from '../db/index.js'

export { ensureDataDir, getDataDir, getSettingsDbPath } from './paths.js'

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
  }
}

export function saveLLMSettings(settings: LLMSettings): void {
  setSetting('llm.provider', settings.provider)
  setSetting(`llm.api_key.${settings.provider}`, settings.apiKey)
  if (settings.apiBase)
    setSetting('llm.api_base', settings.apiBase)
  if (settings.model)
    setSetting('llm.model', settings.model)
  setSetting('setup.completed', 'true')
}

export function getServerPort(): number {
  return Number(getSetting('server.port')) || 3000
}

export function isYoloMode(): boolean {
  return getSetting('server.yolo_mode') === 'true'
}
