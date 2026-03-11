#!/usr/bin/env bun
/**
 * Unified dev entry point — single command, single URL, with HMR.
 *
 * Internally manages Vite dev server as a background child process,
 * then starts Bun server that proxies non-API requests to Vite.
 * From the user's perspective, it feels like a single process.
 *
 * Usage:
 *   pnpm dev           → Start development server at http://localhost:3000
 *   pnpm dev config    → Run interactive LLM config setup
 *   pnpm dev <command> → Delegate to CLI entry (config, help, version, etc.)
 */
import process from 'node:process'

// Note: the root TS config may not include Bun's global types.
// Declare minimal types to keep editor/linter happy.
interface Subprocess {
  exited: Promise<number>
  kill: () => void
}

declare const Bun: {
  spawn: (cmd: string[], options?: any) => Subprocess
}

const args = process.argv.slice(2)

if (args.length > 0) {
  // Delegate to CLI entry with the given args
  const proc = Bun.spawn(
    ['bun', 'apps/cli/src/index.ts', ...args],
    { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' },
  )
  const code = await proc.exited
  process.exit(code)
}

// --- No args: start dev server ---

const VITE_PORT = 5173
const VITE_ORIGIN = `http://localhost:${VITE_PORT}`
const VITE_READY_URL = `${VITE_ORIGIN}/@vite/client`

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchOk(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok
  }
  catch {
    return false
  }
  finally {
    clearTimeout(t)
  }
}

async function waitForViteReady(vite: Subprocess, timeoutMs: number = 30_000): Promise<void> {
  const startedAt = Date.now()
  let delayMs = 100

  while (Date.now() - startedAt < timeoutMs) {
    const result = await Promise.race([
      fetchOk(VITE_READY_URL, 500).then(ok => ({ kind: 'fetch' as const, ok })),
      vite.exited.then((code: number) => ({ kind: 'exit' as const, code })),
    ])

    if (result.kind === 'exit') {
      throw new Error(`Vite exited with code ${result.code}`)
    }

    if (result.ok) {
      return
    }

    await sleep(delayMs)
    delayMs = Math.min(Math.floor(delayMs * 1.5), 1000)
  }

  throw new Error(`Vite did not become ready at ${VITE_ORIGIN} within ${Math.round(timeoutMs / 1000)}s`)
}

// 1. Start Vite dev server as a managed background process (HMR)
const vite = Bun.spawn(
  ['pnpm', '-F', '@univedge/locus-web', 'exec', 'vite', '--port', String(VITE_PORT), '--strictPort'],
  { stdout: 'ignore', stderr: 'inherit' },
)

// Wait until Vite is reachable
await waitForViteReady(vite)

// 2. Start Bun server with --watch (proxies non-API requests to Vite)
const server = Bun.spawn(
  ['bun', '--watch', 'src/index.ts'],
  { cwd: 'apps/server', stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' },
)

// 3. Cleanup: kill Vite when server exits
function cleanup(): void {
  try {
    vite.kill()
  }
  catch {}
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

const serverCode = await server.exited
cleanup()
process.exit(serverCode)
