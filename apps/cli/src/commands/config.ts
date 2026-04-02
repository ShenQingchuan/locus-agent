import process from 'node:process'
import { initDB } from '@univedge/locus-server/db'
import {
  ensureDataDir,
  getLLMSettings,
  getServerPort,
  getSettingsDbPath,
  saveLLMSettings,
  setSetting,
} from '@univedge/locus-server/settings'
import { defineCommand } from 'citty'
import { getMigrationsFolder } from '../paths.js'
import { runSetup } from '../setup/interactive.js'

export default defineCommand({
  meta: { name: 'config', description: 'Re-configure LLM settings' },
  async run() {
    ensureDataDir()
    const dbPath = getSettingsDbPath()
    initDB({ dbPath, migrationsFolder: getMigrationsFolder() })

    const existing = getLLMSettings()
    const existingPort = getServerPort()
    const settings = await runSetup(existing, existingPort)
    saveLLMSettings(settings)
    setSetting('server.port', String(settings.port))
    process.exit(0)
  },
})
