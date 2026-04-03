import type { ACPResult, RunACPOptions } from './runner.js'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { createACPRunner } from './runner.js'

export type RunKimiCLIOptions = RunACPOptions
export type KimiCLIResult = ACPResult

// ---------------------------------------------------------------------------
// Runner singleton
// ---------------------------------------------------------------------------

const runner = createACPRunner({
  name: 'kimi-cli',
  spawn: (cwd) => {
    return spawn('kimi', ['acp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    })
  },
  // Kimi CLI uses minimal session creation — no special meta needed
})

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runKimiCLI(options: RunKimiCLIOptions): Promise<KimiCLIResult> {
  return runner.run(options)
}
