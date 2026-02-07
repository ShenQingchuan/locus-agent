#!/usr/bin/env bun
/**
 * Unified dev entry point.
 *
 * Usage:
 *   pnpm dev           → Start server + web dev (parallel)
 *   pnpm dev config    → Run interactive LLM config setup
 *   pnpm dev <command> → Delegate to CLI entry (config, help, version, etc.)
 */
import process from 'node:process'

const args = process.argv.slice(2)

if (args.length === 0) {
  // No args: start parallel dev server + web
  const proc = Bun.spawn(
    ['pnpm', '--parallel', '-F', '@locus-agent/server', '-F', '@locus-agent/web', 'dev'],
    { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' },
  )
  await proc.exited
}
else {
  // Delegate to CLI entry with the given args
  const proc = Bun.spawn(
    ['bun', 'apps/cli/src/index.ts', ...args],
    { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' },
  )
  const code = await proc.exited
  process.exit(code)
}
