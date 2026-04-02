import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import process from 'node:process'
import { ensureDataDir } from '@univedge/locus-server/settings'
import { defineCommand } from 'citty'
import { getPidPath } from '../paths.js'

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
  meta: { name: 'stop', description: 'Stop the running server' },
  run() {
    ensureDataDir()
    const pidPath = getPidPath()

    if (!existsSync(pidPath)) {
      console.log('Locus Agent is not running.')
      process.exit(0)
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
    process.exit(0)
  },
})
