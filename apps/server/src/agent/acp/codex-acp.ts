import type { ACPResult, RunACPOptions } from './runner.js'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createACPRunner } from './runner.js'

export type RunCodexACPOptions = RunACPOptions
export type CodexACPResult = ACPResult

// ---------------------------------------------------------------------------
// Resolve codex-acp binary
// ---------------------------------------------------------------------------

function resolveAcpBinary(): string {
  const require = createRequire(import.meta.url)
  try {
    const pkgJsonPath = require.resolve('@zed-industries/codex-acp/package.json')
    const pkgRoot = dirname(pkgJsonPath)
    return resolve(pkgRoot, 'bin/codex-acp.js')
  }
  catch {
    const thisFile = fileURLToPath(import.meta.url)
    return resolve(dirname(thisFile), '../../node_modules/@zed-industries/codex-acp/bin/codex-acp.js')
  }
}

// ---------------------------------------------------------------------------
// Runner singleton
// ---------------------------------------------------------------------------

const runner = createACPRunner({
  name: 'codex',
  spawn: (cwd) => {
    const binPath = resolveAcpBinary()
    return spawn(process.execPath, [binPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    })
  },
})

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runCodexACP(options: RunCodexACPOptions): Promise<CodexACPResult> {
  return runner.run(options)
}
