import type { ACPCallbacks, ACPResult, RunACPOptions } from './runner.js'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { createACPRunner } from './runner.js'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export type KimiCLICallbacks = ACPCallbacks

export interface RunKimiCLIOptions extends KimiCLICallbacks {
  prompt: string
  attachments?: RunACPOptions['attachments']
  conversationId: string
  workspaceRoot: string
  abortSignal?: AbortSignal
}

export type KimiCLIResult = ACPResult

// ---------------------------------------------------------------------------
// Runner singleton
// ---------------------------------------------------------------------------

const runner = createACPRunner({
  name: 'kimi-cli',
  spawn: (cwd) => {
    return spawn('kimi', ['acp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
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
