export type SettingsSectionId = 'llm' | 'server' | 'whitelist' | 'embedding' | 'mcp'

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  label: string
  description: string
  icon: string
}> = [
  { id: 'llm', label: 'LLM', description: '模型与 API 提供商', icon: 'i-carbon-machine-learning-model' },
  { id: 'server', label: '服务端', description: '端口与运行状态', icon: 'i-carbon-application-web' },
  { id: 'whitelist', label: '白名单', description: '路径访问控制', icon: 'i-carbon-document-security' },
  { id: 'embedding', label: 'Embedding', description: '语义检索与本地模型', icon: 'i-carbon-model-alt' },
  { id: 'mcp', label: 'MCP', description: '工具服务与集成', icon: 'i-carbon-connection-signal' },
]
