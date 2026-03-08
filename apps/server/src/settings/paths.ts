import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'

const APP_NAME = 'locus-agent'

/**
 * XDG data directory
 * Default: ~/.local/share/locus-agent/
 */
export function getDataDir(): string {
  const xdgData = env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdgData, APP_NAME)
}

/**
 * Settings database file path
 */
export function getSettingsDbPath(): string {
  return join(getDataDir(), 'locus.db')
}

/**
 * Locus-managed skills directory path
 */
export function getSkillsDataDir(): string {
  return join(getDataDir(), 'skills')
}

/**
 * Ensure required directories exist
 */
export function ensureDataDir(): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const skillsDir = getSkillsDataDir()
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true })
  }
}
