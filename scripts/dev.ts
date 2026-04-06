#!/usr/bin/env bun
/**
 * Unified dev entry — single browser URL with HMR.
 *
 * Vite serves the app on :3000 (so CSS / @vite/client / HMR match the page origin).
 * Bun serves API only on :3001; Vite proxies `/api` and `/health` to Bun.
 *
 * (Older "Bun proxies everything to Vite" mode broke Vite's dev CSS pipeline and caused FOUC.)
 *
 * Usage:
 *   pnpm dev           → App at http://localhost:3000
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

/** Browser / Vite dev server */
const VITE_PORT = 3000
/** API (Bun + Hono) — must match vite.config.ts proxy target */
const API_PORT = 3001

const VITE_ORIGIN = `http://localhost:${VITE_PORT}`
const VITE_READY_URL = `${VITE_ORIGIN}/@vite/client`
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/health`

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

async function waitForProcessReady(
  label: string,
  readyUrl: string,
  proc: Subprocess,
  timeoutMs: number = 30_000,
): Promise<void> {
  const startedAt = Date.now()
  let delayMs = 100

  while (Date.now() - startedAt < timeoutMs) {
    const result = await Promise.race([
      fetchOk(readyUrl, 500).then(ok => ({ kind: 'fetch' as const, ok })),
      proc.exited.then((code: number) => ({ kind: 'exit' as const, code })),
    ])

    if (result.kind === 'exit') {
      throw new Error(`${label} exited with code ${result.code}`)
    }

    if (result.ok) {
      return
    }

    await sleep(delayMs)
    delayMs = Math.min(Math.floor(delayMs * 1.5), 1000)
  }

  throw new Error(`${label} did not become ready at ${readyUrl} within ${Math.round(timeoutMs / 1000)}s`)
}

const isAnalyze = process.env.ANALYZE === 'true'

const devEnv = {
  ...process.env,
  LOCUS_API_PORT: String(API_PORT),
} as Record<string, string>

const viteEnv = {
  ...process.env,
  LOCUS_VITE_FRONT: '1',
} as Record<string, string>

// 1. API server first (Vite proxy needs a live backend)
const apiServer = Bun.spawn(
  ['bun', '--watch', 'src/index.ts'],
  {
    cwd: 'apps/server',
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
    env: devEnv,
  },
)

await waitForProcessReady('Bun API', API_HEALTH_URL, apiServer)

// 2. Vite on the browser port (HMR + CSS pipeline aligned with document origin)
const vite = Bun.spawn(
  ['pnpm', '-F', '@univedge/locus-web', 'exec', 'vite', '--port', String(VITE_PORT), '--strictPort'],
  {
    stdout: isAnalyze ? 'inherit' : 'ignore',
    stderr: 'inherit',
    stdin: isAnalyze ? 'inherit' : 'ignore',
    env: viteEnv,
  },
)

await waitForProcessReady('Vite', VITE_READY_URL, vite)

// Bun prints its own URL for the API child (port 3001) — clarify the browser entry vs API.
console.log(
  `\n  ➜  Web UI (open in browser): ${VITE_ORIGIN}/`,
  `\n  ➜  API Server: http://localhost:${API_PORT}/\n`,
)

function cleanup(): void {
  try {
    vite.kill()
  }
  catch {}
  try {
    apiServer.kill()
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

const apiExitCode = await apiServer.exited
cleanup()
process.exit(apiExitCode)
