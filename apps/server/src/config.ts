/**
 * 服务器配置
 * 支持外部注入（CLI 模式）或从环境变量读取（dev 模式）
 */

export interface ServerConfig {
  /** 确认模式：true = 需要确认，false = yolo 模式 */
  confirmMode: boolean
  /** 服务端口 */
  port: number
}

let _config: ServerConfig | null = null

/**
 * 注入服务器配置（CLI 启动时调用）
 * 若未调用，则 fallback 到 Bun.env（dev 模式兼容）
 */
export function setServerConfig(cfg: Partial<ServerConfig>): void {
  _config = {
    confirmMode: cfg.confirmMode ?? true,
    port: cfg.port ?? 3000,
  }
}

function resolveConfig(): ServerConfig {
  if (_config) return _config
  _config = {
    confirmMode: Bun.env.YOLO_MODE !== 'true',
    port: Number(Bun.env.PORT) || 3000,
  }
  return _config
}

export const config = new Proxy({} as ServerConfig, {
  get(_target, prop) {
    return resolveConfig()[prop as keyof ServerConfig]
  },
})
