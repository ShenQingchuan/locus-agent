import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const APP_NAME = 'locus-agent'

/**
 * XDG 数据目录
 * 默认 ~/.local/share/locus-agent/
 */
export function getDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  return join(xdgData, APP_NAME)
}

/**
 * 数据库文件路径
 */
export function getDbPath(): string {
  return join(getDataDir(), 'locus.db')
}

/**
 * Web 构建产物目录
 * 开发模式下相对于 src/，构建后相对于 dist/
 */
export function getWebDistDir(): string {
  // import.meta.dirname 在 Bun 中指向当前文件所在目录
  // dev 模式: apps/cli/src/ -> apps/web/dist/
  // build 模式: apps/cli/dist/ -> apps/cli/dist/web/
  const currentDir = dirname(Bun.main)
  const webDir = resolve(currentDir, 'web')
  if (existsSync(webDir)) {
    return webDir
  }
  // dev 模式 fallback: 从 src 目录向上找 web/dist
  return resolve(currentDir, '../../web/dist')
}

/**
 * Drizzle 迁移文件目录
 * dev 模式: apps/server/drizzle/
 * build 模式: apps/cli/dist/drizzle/
 */
export function getMigrationsFolder(): string {
  const currentDir = dirname(Bun.main)
  const bundledDir = resolve(currentDir, 'drizzle')
  if (existsSync(bundledDir)) {
    return bundledDir
  }
  // dev 模式 fallback
  return resolve(currentDir, '../../server/drizzle')
}

/**
 * PID 文件路径
 */
export function getPidPath(): string {
  return join(getDataDir(), 'locus.pid')
}

/**
 * 日志文件路径
 */
export function getLogPath(): string {
  return join(getDataDir(), 'locus.log')
}

/**
 * 确保所需目录存在
 */
export function ensureDirs(): void {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
}
