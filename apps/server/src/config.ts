/**
 * Server configuration.
 * Must be injected via setServerConfig() before use (both CLI and dev mode).
 */

import process from 'node:process'

export interface ServerConfig {
  /** Confirm mode: true = require approval, false = yolo mode */
  confirmMode: boolean
  /** Server port */
  port: number
  /** Allowed CORS origins */
  allowedOrigins: string[]
}

export const corsOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

let _config: ServerConfig | null = null

/**
 * Inject server config (called at startup by both CLI and dev mode)
 */
export function setServerConfig(cfg: Partial<ServerConfig>): void {
  _config = {
    confirmMode: cfg.confirmMode ?? true,
    port: cfg.port ?? 3000,
    allowedOrigins: cfg.allowedOrigins ?? corsOrigins,
  }
}

function resolveConfig(): ServerConfig {
  if (_config)
    return _config
  throw new Error('Server config not initialized. Run `locus-agent config` to set up.')
}

export const config = new Proxy({} as ServerConfig, {
  get(_target, prop) {
    return resolveConfig()[prop as keyof ServerConfig]
  },
})
