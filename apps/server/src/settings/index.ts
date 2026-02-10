import type { LLMProviderType } from '@locus-agent/shared'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Database } from 'bun:sqlite'

export { ensureDataDir, getDataDir, getSettingsDbPath } from './paths.js'

let _sqlite: Database | null = null

/**
 * Open the settings database
 */
export function openSettingsDb(dbPath: string): void {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  _sqlite = new Database(dbPath, { create: true })
  _sqlite.run('PRAGMA foreign_keys = ON;')
  _sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
}

/**
 * Close the settings database
 */
export function closeSettingsDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
}

function getSqlite(): Database {
  if (!_sqlite) throw new Error('Settings DB not initialized. Call openSettingsDb() first.')
  return _sqlite
}

export function getSetting(key: string): string | undefined {
  const row = getSqlite()
    .query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getSqlite().run(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch())',
    [key, value],
  )
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
  if (!apiKey) return null
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
