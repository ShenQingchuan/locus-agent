/**
 * 服务器配置
 * 从环境变量读取配置
 */

export interface ServerConfig {
  /** 确认模式：true = 需要确认，false = yolo 模式 */
  confirmMode: boolean
}

/**
 * 服务器配置实例
 * - 默认为确认模式（confirmMode: true）
 * - 设置环境变量 YOLO_MODE=true 可启用 yolo 模式
 */
export const config: ServerConfig = {
  confirmMode: Bun.env.YOLO_MODE !== 'true',
}
