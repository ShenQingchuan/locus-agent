import type { ACPCallbacks, ACPResult, RunACPOptions } from './runner.js'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createACPRunner } from './runner.js'

// ---------------------------------------------------------------------------
// Public interfaces (unchanged — chat.ts depends on these)
// ---------------------------------------------------------------------------

export type LocalClaudeCodeCallbacks = ACPCallbacks

export interface RunLocalClaudeCodeOptions extends LocalClaudeCodeCallbacks {
  prompt: string
  attachments?: RunACPOptions['attachments']
  conversationId: string
  workspaceRoot: string
  abortSignal?: AbortSignal
}

export type LocalClaudeCodeResult = ACPResult

// ---------------------------------------------------------------------------
// Resolve claude-agent-acp binary
// ---------------------------------------------------------------------------

function resolveAcpBinary(): string {
  const require = createRequire(import.meta.url)
  try {
    const pkgJsonPath = require.resolve('@agentclientprotocol/claude-agent-acp/package.json')
    const pkgRoot = dirname(pkgJsonPath)
    return resolve(pkgRoot, 'dist/index.js')
  }
  catch {
    const thisFile = fileURLToPath(import.meta.url)
    return resolve(dirname(thisFile), '../../node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js')
  }
}

// ---------------------------------------------------------------------------
// Runner singleton
// ---------------------------------------------------------------------------

const runner = createACPRunner({
  name: 'local-claude-code',
  spawn: (cwd) => {
    const binPath = resolveAcpBinary()
    return spawn(process.execPath, [binPath], {
      cwd,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        PATH: process.env.PATH,
      },
    })
  },
  sessionMeta: {
    claudeCode: {
      options: {
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    },
  },
})

// ---------------------------------------------------------------------------
// Main entry (public API unchanged)
// ---------------------------------------------------------------------------

export async function runLocalClaudeCode(options: RunLocalClaudeCodeOptions): Promise<LocalClaudeCodeResult> {
  return runner.run(options)
}
