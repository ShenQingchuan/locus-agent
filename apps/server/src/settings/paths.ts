import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const APP_NAME = 'locus-agent'

/**
 * XDG data directory
 * Default: ~/.local/share/locus-agent/
 */
export function getDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdgData, APP_NAME)
}

/**
 * Settings database file path
 */
export function getSettingsDbPath(): string {
  return join(getDataDir(), 'locus.db')
}

/**
 * Ensure required directories exist
 */
export function ensureDataDir(): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
}
