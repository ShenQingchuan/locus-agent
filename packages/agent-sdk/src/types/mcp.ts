/**
 * MCP (Model Context Protocol) 相关类型定义
 * 配置格式兼容 Cursor / Claude Code 的 mcpServers JSON
 */

/**
 * 单个 MCP Server 配置
 */
export interface MCPServerConfig {
  /** stdio transport: 可执行命令 */
  command?: string
  /** stdio transport: 命令参数 */
  args?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** SSE / HTTP transport: 服务端 URL */
  url?: string
  /** URL transport 类型：'sse'（默认）或 'http'（Streamable HTTP） */
  transportType?: 'sse' | 'http'
  /** HTTP 请求头（用于鉴权等，仅 SSE / HTTP transport 生效） */
  headers?: Record<string, string>
  /** 是否禁用（保留配置但不连接） */
  disabled?: boolean
}

/**
 * 完整 MCP 配置（兼容 Cursor / Claude Code mcp.json 格式）
 */
export interface MCPServersConfig {
  mcpServers: Record<string, MCPServerConfig>
}

/** MCP Server 连接状态 */
export type MCPServerConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

/**
 * MCP Server 运行时状态
 */
export interface MCPServerStatus {
  /** Server 名称 */
  name: string
  /** 连接状态 */
  status: MCPServerConnectionStatus
  /** 错误信息 */
  error?: string
  /** 提供的工具名列表 */
  tools: string[]
  /** 是否被 disabled */
  disabled: boolean
}
