import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { getDataDir } from '@univedge/locus-server/settings'

/**
 * Web build output directory.
 * Dev mode: relative to src/, build mode: relative to dist/
 */
export function getWebDistDir(): string {
  // import.meta.dirname points to current file's directory in Bun
  // dev mode: apps/cli/src/ -> apps/web/dist/
  // build mode: apps/cli/dist/ -> apps/cli/dist/web/
  const currentDir = dirname(Bun.main)
  const webDir = resolve(currentDir, 'web')
  if (existsSync(webDir)) {
    return webDir
  }
  // dev mode fallback: find web/dist from src directory
  return resolve(currentDir, '../../web/dist')
}

/**
 * Drizzle migration files directory.
 * Dev mode: apps/server/drizzle/
 * Build mode: apps/cli/dist/drizzle/
 */
export function getMigrationsFolder(): string {
  const currentDir = dirname(Bun.main)
  const bundledDir = resolve(currentDir, 'drizzle')
  if (existsSync(bundledDir)) {
    return bundledDir
  }
  // dev mode fallback
  return resolve(currentDir, '../../server/drizzle')
}

/**
 * PID file path
 */
export function getPidPath(): string {
  return join(getDataDir(), 'locus.pid')
}

/**
 * Log file path
 */
export function getLogPath(): string {
  return join(getDataDir(), 'locus.log')
}
