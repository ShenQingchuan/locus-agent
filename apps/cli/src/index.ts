#!/usr/bin/env bun
import process from 'node:process'
import { ensureDirs, getDbPath, getMigrationsFolder, getWebDistDir } from './paths.js'
import { startServer } from './server.js'
import {
  closeSettingsDb,
  getLLMSettings,
  getServerPort,
  isSetupComplete,
  isYoloMode,
  openSettingsDb,
  saveLLMSettings,
} from './settings.js'
import { runSetup } from './setup/interactive.js'

const args = process.argv.slice(2)
const command = args[0]

async function main(): Promise<void> {
  switch (command) {
    case 'config':
      await handleConfig()
      break
    case 'version':
    case '--version':
    case '-v':
      handleVersion()
      break
    case 'help':
    case '--help':
    case '-h':
      handleHelp()
      break
    default:
      await handleStart()
      break
  }
}

async function handleStart(): Promise<void> {
  ensureDirs()
  const dbPath = getDbPath()
  openSettingsDb(dbPath)

  // 首次运行：交互式配置
  if (!isSetupComplete()) {
    const settings = await runSetup()
    saveLLMSettings(settings)
  }

  const llmSettings = getLLMSettings()
  if (!llmSettings) {
    console.error('Error: LLM settings not found. Run `locus-agent config` to set up.')
    process.exit(1)
  }

  const port = getServerPort()
  const yoloMode = isYoloMode()

  // 关闭 CLI 的 DB 连接，后续由 server 的 Drizzle 打开同一文件
  closeSettingsDb()

  startServer({
    dbPath,
    migrationsFolder: getMigrationsFolder(),
    llmSettings,
    port,
    webDistDir: getWebDistDir(),
    yoloMode,
  })
}

async function handleConfig(): Promise<void> {
  ensureDirs()
  openSettingsDb(getDbPath())

  const existing = getLLMSettings()
  const settings = await runSetup(existing)
  saveLLMSettings(settings)

  closeSettingsDb()
}

function handleVersion(): void {
  console.log('locus-agent v0.1.0')
}

function handleHelp(): void {
  console.log(`
Usage: locus-agent [command]

Commands:
  (default)    Start Locus Agent server
  config       Re-configure LLM settings
  version      Show version
  help         Show this help message

Data: ~/.local/share/locus-agent/
`)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
