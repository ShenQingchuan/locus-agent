import { spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { defineCommand } from 'citty'
import { initDB } from '@univedge/locus-server/db'
import {
  ensureDataDir,
  getServerPort,
  getSettingsDbPath,
  isSetupComplete,
  setSetting,
} from '@univedge/locus-server/settings'
import { getLogPath, getMigrationsFolder, getPidPath } from '../paths.js'

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

export default defineCommand({
  meta: { name: 'start', description: 'Start Locus Agent server (background)' },
  args: {
    port: { type: 'string', description: 'Override server port (default: 3000)' },
  },
  async run({ args }) {
    const portFlag = args.port ? Number(args.port) : undefined

    ensureDataDir()
    const dbPath = getSettingsDbPath()
    initDB({ dbPath, migrationsFolder: getMigrationsFolder() })

    if (!isSetupComplete()) {
      setSetting('setup.completed', 'true')
      setSetting('server.port', String(portFlag ?? 3000))
    }

    const pidPath = getPidPath()
    if (existsSync(pidPath)) {
      const oldPid = Number(readFileSync(pidPath, 'utf-8').trim())
      if (isProcessAlive(oldPid)) {
        const port = portFlag ?? getServerPort()
        console.log(`Locus Agent is already running (pid ${oldPid}) at http://localhost:${port}`)
        process.exit(0)
      }
      unlinkSync(pidPath)
    }

    const port = portFlag ?? getServerPort()

    const childArgs = [Bun.main, 'daemon']
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

    writeFileSync(pidPath, String(child.pid))

    console.log(`Locus Agent started (pid ${child.pid}) at http://localhost:${port}`)
    console.log(`Log: ${logPath}`)
    console.log(`Run \`locus stop\` to stop the server.`)
    process.exit(0)
  },
})
