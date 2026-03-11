#!/usr/bin/env bun
import { spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { initDB } from '@univedge/locus-server/db'
import {
  ensureDataDir,
  getLLMSettings,
  getServerPort,
  getSettingsDbPath,
  isSetupComplete,
  isYoloMode,
  saveLLMSettings,
  setSetting,
} from '@univedge/locus-server/settings'
import { getLogPath, getMigrationsFolder, getPidPath, getWebDistDir } from './paths.js'
import { startServer } from './server.js'
import { runSetup } from './setup/interactive.js'

const args = process.argv.slice(2)

/** 解析 --port <num> 参数 */
function parsePortFlag(): number | undefined {
  const idx = args.indexOf('--port')
  if (idx !== -1 && args[idx + 1]) {
    const p = Number(args[idx + 1])
    if (!Number.isNaN(p) && p > 0 && p < 65536)
      return p
    console.error('Error: invalid port number')
    process.exit(1)
  }
  return undefined
}

/** 获取去掉 flag 后的子命令 */
function getCommand(): string | undefined {
  for (const a of args) {
    if (a === '--port')
      return undefined // skip
    if (a.startsWith('--'))
      continue
    if (!Number.isNaN(Number(a)))
      continue // skip port number value
    return a
  }
  return undefined
}

const portFlag = parsePortFlag()
const command = args.includes('--daemon') ? '--daemon' : getCommand()

async function main(): Promise<void> {
  switch (command) {
    case '--daemon':
      await handleDaemon()
      break
    case 'stop':
      handleStop()
      break
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

/**
 * 前台模式：用于 detached 子进程实际运行服务器
 */
async function handleDaemon(): Promise<void> {
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
}

/**
 * 默认命令 / start：后台启动服务
 */
async function handleStart(): Promise<void> {
  ensureDataDir()
  const dbPath = getSettingsDbPath()
  initDB({ dbPath, migrationsFolder: getMigrationsFolder() })

  // 首次运行：写入空默认配置，跳过交互式 setup
  if (!isSetupComplete()) {
    setSetting('setup.completed', 'true')
    setSetting('server.port', String(portFlag ?? 3000))
  }

  // 检查是否已在运行
  const pidPath = getPidPath()
  if (existsSync(pidPath)) {
    const oldPid = Number(readFileSync(pidPath, 'utf-8').trim())
    if (isProcessAlive(oldPid)) {
      const port = portFlag ?? getServerPort()
      console.log(`Locus Agent is already running (pid ${oldPid}) at http://localhost:${port}`)
      return
    }
    // stale pid file
    unlinkSync(pidPath)
  }

  const port = portFlag ?? getServerPort()

  // 构造子进程参数
  const childArgs = [Bun.main, '--daemon']
  if (portFlag)
    childArgs.push('--port', String(portFlag))

  const logPath = getLogPath()
  const logFd = openSync(logPath, 'a')

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  })

  child.unref()

  // 写入 PID 文件
  writeFileSync(pidPath, String(child.pid))

  console.log(`Locus Agent started (pid ${child.pid}) at http://localhost:${port}`)
  console.log(`Log: ${logPath}`)
  console.log(`Run \`locus stop\` to stop the server.`)
}

/**
 * stop：停止后台服务
 */
function handleStop(): void {
  ensureDataDir()
  const pidPath = getPidPath()

  if (!existsSync(pidPath)) {
    console.log('Locus Agent is not running.')
    return
  }

  const pid = Number(readFileSync(pidPath, 'utf-8').trim())

  if (isProcessAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`Locus Agent stopped (pid ${pid}).`)
    }
    catch {
      console.error(`Failed to stop process ${pid}. You can kill it manually: kill ${pid}`)
    }
  }
  else {
    console.log('Locus Agent is not running (stale pid file).')
  }

  unlinkSync(pidPath)
}

async function handleConfig(): Promise<void> {
  ensureDataDir()
  const dbPath = getSettingsDbPath()
  initDB({ dbPath, migrationsFolder: getMigrationsFolder() })

  const existing = getLLMSettings()
  const existingPort = getServerPort()
  const settings = await runSetup(existing, existingPort)
  saveLLMSettings(settings)
  setSetting('server.port', String(settings.port))
}

function handleVersion(): void {
  console.log('locus-agent v0.1.0')
}

function handleHelp(): void {
  console.log(`
Usage: locus [command] [options]

Commands:
  (default)    Start Locus Agent server (background)
  stop         Stop the running server
  config       Re-configure LLM settings
  version      Show version
  help         Show this help message

Options:
  --port <n>   Override server port (default: 3000)

Data: ~/.local/share/locus-agent/
`)
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
