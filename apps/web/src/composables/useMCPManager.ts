import type { MCPServerConfig, MCPServerConnectionStatus, MCPServerStatus } from '@locus-agent/shared'
import { useToast } from '@locus-agent/ui'
import { onMounted, onUnmounted, ref } from 'vue'
import {
  fetchMCPConfig,
  fetchMCPLogs,
  fetchMCPStatus,
  restartMCPServer,
  subscribeMCPStatus,
  updateMCPConfig,
} from '@/api/mcp'

// ---------------------------------------------------------------------------
// Helpers (pure functions)
// ---------------------------------------------------------------------------

function parseHeadersText(text: string): Record<string, string> | null {
  const trimmed = text.trim()
  if (!trimmed)
    return null
  const headers: Record<string, string> = {}
  for (const line of trimmed.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0)
      continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key)
      headers[key] = val
  }
  return Object.keys(headers).length > 0 ? headers : null
}

export function statusColor(status?: string): string {
  switch (status) {
    case 'connected': return 'text-green-500'
    case 'connecting': return 'text-yellow-500'
    case 'error': return 'text-red-500'
    default: return 'text-muted-foreground'
  }
}

export function statusLabel(status?: string): string {
  switch (status) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中'
    case 'error': return '错误'
    case 'disconnected': return '休眠中'
    default: return '未连接'
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useMCPManager() {
  const toast = useToast()

  // --- State ---
  const mcpServers = ref<Record<string, MCPServerConfig>>({})
  const mcpStatus = ref<MCPServerStatus[]>([])
  const mcpJsonMode = ref(false)
  const mcpJsonText = ref('')
  const mcpJsonError = ref<string | null>(null)
  const isMcpSaving = ref(false)
  const isMcpRestarting = ref(false)
  const isMcpLogPanelOpen = ref(false)
  const isMcpLogsLoading = ref(false)
  const mcpLogs = ref<string[]>([])
  const expandedTools = ref<Set<string>>(new Set())

  // Add form state
  const showAddForm = ref(false)
  const newServerMode = ref<'stdio' | 'url'>('stdio')
  const newServer = ref({ name: '', command: '', args: '', url: '', transportType: 'http' as 'sse' | 'http', headersText: '' })

  let unsubscribeMCP: (() => void) | null = null

  // --- Helpers ---
  function mcpStatusOf(name: string): MCPServerStatus | undefined {
    return mcpStatus.value.find(s => s.name === name)
  }

  function applyMCPStatus(statusList?: MCPServerStatus[]) {
    if (!statusList)
      return
    mcpStatus.value = statusList
  }

  function isServerInitializing(name: string): boolean {
    const cfg = mcpServers.value[name]
    if (!cfg || cfg.disabled)
      return false
    return mcpStatusOf(name)?.status === 'connecting'
  }

  function syncJsonText() {
    mcpJsonText.value = JSON.stringify({ mcpServers: mcpServers.value }, null, 2)
    mcpJsonError.value = null
  }

  function onJsonInput() {
    try {
      const parsed = JSON.parse(mcpJsonText.value)
      if (parsed && typeof parsed.mcpServers === 'object') {
        mcpJsonError.value = null
      }
      else {
        mcpJsonError.value = '缺少 mcpServers 字段'
      }
    }
    catch {
      mcpJsonError.value = 'JSON 格式错误'
    }
  }

  // --- SSE ---
  function handleStatusChange(event: { name: string, status: string, error?: string, tools: string[], disabled: boolean }) {
    const existing = mcpStatus.value.find(s => s.name === event.name)
    if (existing) {
      existing.status = event.status as any
      existing.error = event.error
      existing.tools = event.tools
      existing.disabled = event.disabled
    }
    else {
      mcpStatus.value.push({
        name: event.name,
        status: event.status as MCPServerConnectionStatus,
        error: event.error,
        tools: event.tools,
        disabled: event.disabled,
      })
    }
  }

  function startSSE() {
    stopSSE()
    unsubscribeMCP = subscribeMCPStatus(
      (initStatus) => {
        applyMCPStatus(initStatus)
      },
      (change) => {
        handleStatusChange(change)
      },
    )
  }

  function stopSSE() {
    if (unsubscribeMCP) {
      unsubscribeMCP()
      unsubscribeMCP = null
    }
  }

  // --- Data loading ---
  async function loadMCP() {
    const [config, status] = await Promise.all([
      fetchMCPConfig(),
      fetchMCPStatus(),
    ])
    mcpServers.value = config?.mcpServers ?? {}
    applyMCPStatus(status)
    syncJsonText()
  }

  async function loadMCPLogs() {
    if (isMcpLogsLoading.value)
      return
    isMcpLogsLoading.value = true
    try {
      mcpLogs.value = await fetchMCPLogs(1000)
    }
    finally {
      isMcpLogsLoading.value = false
    }
  }

  async function toggleMCPLogsPanel() {
    isMcpLogPanelOpen.value = !isMcpLogPanelOpen.value
    if (isMcpLogPanelOpen.value) {
      await loadMCPLogs()
    }
  }

  // --- Actions ---
  async function saveMCP() {
    if (isMcpSaving.value)
      return
    isMcpSaving.value = true
    try {
      let servers: Record<string, MCPServerConfig>
      if (mcpJsonMode.value) {
        try {
          const parsed = JSON.parse(mcpJsonText.value)
          servers = parsed.mcpServers ?? parsed
        }
        catch {
          toast.error('JSON 格式错误')
          return
        }
      }
      else {
        servers = mcpServers.value
      }

      const result = await updateMCPConfig({ mcpServers: servers })
      if (!result.success) {
        toast.error(result.message || 'MCP 保存失败')
        return
      }
      toast.success('MCP 配置已保存')
      applyMCPStatus(result.status)
      mcpServers.value = servers
      syncJsonText()
    }
    finally {
      isMcpSaving.value = false
    }
  }

  async function onRestartAll() {
    if (isMcpRestarting.value)
      return
    isMcpRestarting.value = true
    try {
      const result = await restartMCPServer()
      if (!result.success) {
        toast.error(result.message || '重启失败')
        return
      }
      applyMCPStatus(result.status)
      toast.success('MCP 已重启')
    }
    finally {
      isMcpRestarting.value = false
    }
  }

  async function onRestartOne(name: string) {
    const result = await restartMCPServer(name)
    if (!result.success) {
      toast.error(result.message || `重启 ${name} 失败`)
      return
    }
    applyMCPStatus(result.status)
  }

  function resetAddForm() {
    newServer.value = { name: '', command: '', args: '', url: '', transportType: 'http', headersText: '' }
    newServerMode.value = 'stdio'
  }

  async function addServer() {
    const name = newServer.value.name.trim()
    if (!name) {
      toast.error('名称不能为空')
      return
    }
    if (mcpServers.value[name]) {
      toast.error(`"${name}" 已存在`)
      return
    }
    const cfg: MCPServerConfig = {}
    if (newServerMode.value === 'stdio') {
      if (!newServer.value.command.trim()) {
        toast.error('请填写命令')
        return
      }
      cfg.command = newServer.value.command.trim()
      if (newServer.value.args.trim())
        cfg.args = newServer.value.args.trim().split(/\s+/)
    }
    else {
      if (!newServer.value.url.trim()) {
        toast.error('请填写 URL')
        return
      }
      cfg.url = newServer.value.url.trim()
      cfg.transportType = newServer.value.transportType
      const headers = parseHeadersText(newServer.value.headersText)
      if (headers)
        cfg.headers = headers
    }
    mcpServers.value[name] = cfg
    resetAddForm()
    showAddForm.value = false
    syncJsonText()

    isMcpSaving.value = true
    try {
      const result = await updateMCPConfig({ mcpServers: mcpServers.value })
      if (!result.success) {
        toast.error(result.message || '保存失败')
        return
      }
      toast.success(`已添加 ${name}`)
      applyMCPStatus(result.status)
    }
    finally {
      isMcpSaving.value = false
    }
  }

  async function removeServer(name: string) {
    delete mcpServers.value[name]
    mcpServers.value = { ...mcpServers.value }
    syncJsonText()

    isMcpSaving.value = true
    try {
      const result = await updateMCPConfig({ mcpServers: mcpServers.value })
      if (!result.success) {
        toast.error(result.message || '删除失败')
        return
      }
      applyMCPStatus(result.status)
    }
    finally {
      isMcpSaving.value = false
    }
  }

  function toggleToolsExpanded(name: string) {
    const set = expandedTools.value
    if (set.has(name))
      set.delete(name)
    else
      set.add(name)
    expandedTools.value = new Set(set)
  }

  async function toggleDisabled(name: string) {
    const cfg = mcpServers.value[name]
    if (!cfg || isMcpSaving.value)
      return
    cfg.disabled = !cfg.disabled
    mcpServers.value = { ...mcpServers.value }
    syncJsonText()
    isMcpSaving.value = true
    try {
      const result = await updateMCPConfig({ mcpServers: mcpServers.value })
      if (!result.success) {
        toast.error(result.message || '保存失败')
        cfg.disabled = !cfg.disabled
        mcpServers.value = { ...mcpServers.value }
        syncJsonText()
        return
      }
      applyMCPStatus(result.status)
    }
    finally {
      isMcpSaving.value = false
    }
  }

  // --- Lifecycle ---
  onMounted(() => {
    loadMCP()
    startSSE()
  })

  onUnmounted(() => {
    stopSSE()
  })

  return {
    // State
    mcpServers,
    mcpStatus,
    mcpJsonMode,
    mcpJsonText,
    mcpJsonError,
    isMcpSaving,
    isMcpRestarting,
    isMcpLogPanelOpen,
    isMcpLogsLoading,
    mcpLogs,
    expandedTools,
    showAddForm,
    newServerMode,
    newServer,

    // Helpers
    mcpStatusOf,
    isServerInitializing,
    syncJsonText,
    onJsonInput,

    // Actions
    saveMCP,
    onRestartAll,
    onRestartOne,
    resetAddForm,
    addServer,
    removeServer,
    toggleToolsExpanded,
    toggleDisabled,
    toggleMCPLogsPanel,
    loadMCPLogs,
  }
}
