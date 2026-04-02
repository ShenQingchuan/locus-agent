import { defineCommand } from 'citty'
import { initDB } from '@univedge/locus-server/db'
import {
  ensureDataDir,
  getLLMSettings,
  getServerPort,
  getSettingsDbPath,
  isYoloMode,
} from '@univedge/locus-server/settings'
import { getMigrationsFolder, getWebDistDir } from '../paths.js'
import { startServer } from '../server.js'

export default defineCommand({
  meta: { name: 'daemon', description: 'Run server in foreground (internal)', hidden: true },
  args: {
    port: { type: 'string', description: 'Server port' },
  },
  run({ args }) {
    const portFlag = args.port ? Number(args.port) : undefined

    ensureDataDir()
    const dbPath = getSettingsDbPath()
    initDB({ dbPath, migrationsFolder: getMigrationsFolder() })

    const llmSettings = getLLMSettings() ?? {
      provider: 'openai' as const,
      apiKey: '',
      apiBase: undefined,
      model: undefined,
    }

    const port = portFlag ?? getServerPort()
    const yoloMode = isYoloMode()

    startServer({
      dbPath,
      migrationsFolder: getMigrationsFolder(),
      llmSettings,
      port,
      webDistDir: getWebDistDir(),
      yoloMode,
    })

    // No process.exit — server must stay alive
  },
})
