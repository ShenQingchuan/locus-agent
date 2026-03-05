<script setup lang="ts">
import type { MCPServerConfig, MCPServerConnectionStatus, MCPServerStatus } from '@locus-agent/shared'
import { Switch, useToast } from '@locus-agent/ui'
import { onMounted, onUnmounted, ref } from 'vue'
import {
  fetchMCPConfig,
  fetchMCPLogs,
  fetchMCPStatus,
  restartMCPServer,
  subscribeMCPStatus,
  updateMCPConfig,
} from '@/api/mcp'
import MonacoEditor from '@/components/code/MonacoEditor.vue'

const toast = useToast()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

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

/** SSE 订阅关闭函数 */
let unsubscribeMCP: (() => void) | null = null

/** 已展开工具列表的 server 名称集合 */
const expandedTools = ref<Set<string>>(new Set())

/** 添加新 server 的临时表单 */
const showAddForm = ref(false)
const newServerMode = ref<'stdio' | 'url'>('stdio')
const newServer = ref({ name: '', command: '', args: '', url: '', transportType: 'http' as 'sse' | 'http', headersText: '' })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function statusColor(status?: string): string {
  switch (status) {
    case 'connected': return 'text-green-500'
    case 'connecting': return 'text-yellow-500'
    case 'error': return 'text-red-500'
    default: return 'text-muted-foreground'
  }
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中'
    case 'error': return '错误'
    case 'disconnected': return '休眠中'
    default: return '未连接'
  }
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadMCP() {
  const [config, status] = await Promise.all([
    fetchMCPConfig(),
    fetchMCPStatus(),
  ])
  mcpServers.value = config?.mcpServers ?? {}
  applyMCPStatus(status)
  syncJsonText()
}

/** 处理单个服务器状态变化 */
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

/** 启动 SSE 订阅 */
function startSSE() {
  stopSSE()
  unsubscribeMCP = subscribeMCPStatus(
    (initStatus) => {
      // 初始化时完整替换状态
      applyMCPStatus(initStatus)
    },
    (change) => {
      // 状态变化时增量更新
      handleStatusChange(change)
    },
  )
}

/** 停止 SSE 订阅 */
function stopSSE() {
  if (unsubscribeMCP) {
    unsubscribeMCP()
    unsubscribeMCP = null
  }
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

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

/**
 * 解析 headers 文本（每行 Key: Value 格式）
 */
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

  // 自动保存并生效
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

  // 自动保存并生效
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

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  loadMCP()
  startSSE()
})

onUnmounted(() => {
  stopSSE()
})
</script>

<template>
  <section class="card p-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-medium text-foreground">
          MCP Servers
        </h2>
        <p class="text-xs text-muted-foreground mt-1">
          配置外部 MCP 工具服务，格式兼容 Cursor / Claude Code
        </p>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="btn-ghost btn-icon"
          :title="mcpJsonMode ? '切换到列表' : '切换到 JSON 编辑'"
          :class="{ 'text-primary': mcpJsonMode }"
          @click="mcpJsonMode = !mcpJsonMode; syncJsonText()"
        >
          <div v-if="mcpJsonMode" class="i-material-symbols:format-list-bulleted-rounded h-4 w-4" />
          <div v-else class="i-carbon-code h-4 w-4" />
        </button>
        <button
          class="btn-ghost btn-icon"
          :title="isMcpLogPanelOpen ? '收起 MCP 日志' : '查看 MCP 日志'"
          :class="{ 'text-primary': isMcpLogPanelOpen }"
          @click="toggleMCPLogsPanel"
        >
          <div class="i-carbon-terminal h-4 w-4" />
        </button>
        <button
          class="btn-ghost btn-icon"
          title="全部重启"
          :disabled="isMcpRestarting || Object.keys(mcpServers).length === 0"
          @click="onRestartAll"
        >
          <div class="i-carbon-renew h-4 w-4" :class="{ 'animate-spin': isMcpRestarting }" />
        </button>
      </div>
    </div>

    <div class="mt-4">
      <!-- JSON 编辑模式 -->
      <template v-if="mcpJsonMode">
        <MonacoEditor
          v-model="mcpJsonText"
          language="json"
          @update:model-value="onJsonInput"
        />
        <p v-if="mcpJsonError" class="text-xs text-red-500 mt-1">
          {{ mcpJsonError }}
        </p>
        <div class="mt-3 flex items-center justify-end">
          <button
            class="btn-primary btn-sm"
            :disabled="isMcpSaving"
            @click="saveMCP"
          >
            <span v-if="isMcpSaving" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1.5" />
            保存 MCP 配置
          </button>
        </div>
      </template>

      <!-- 列表模式 -->
      <template v-else>
        <div v-if="Object.keys(mcpServers).length === 0" class="text-xs text-muted-foreground py-4 text-center">
          暂无 MCP Server 配置
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="(cfg, name) in mcpServers"
            :key="name"
            class="rounded-lg border border-border"
            :class="{ 'opacity-50': cfg.disabled }"
          >
            <div class="flex items-center gap-2 px-3 py-2">
              <!-- 状态点 -->
              <div
                class="h-2 w-2 rounded-full flex-shrink-0"
                :class="{
                  'bg-green-500': !cfg.disabled && mcpStatusOf(name as string)?.status === 'connected',
                  'bg-yellow-500': isServerInitializing(name as string) || (!cfg.disabled && mcpStatusOf(name as string)?.status === 'connecting'),
                  'bg-red-500': !cfg.disabled && mcpStatusOf(name as string)?.status === 'error',
                  'bg-muted-foreground/30': cfg.disabled || !mcpStatusOf(name as string) || mcpStatusOf(name as string)?.status === 'disconnected',
                }"
                :title="cfg.disabled
                  ? '未启用'
                  : (isServerInitializing(name as string)
                    ? '初始化中'
                    : (mcpStatusOf(name as string)?.error || statusLabel(mcpStatusOf(name as string)?.status)))"
              />

              <!-- 主行：名字 · 状态 · 工具数 -->
              <div class="flex-1 min-w-0 text-xs">
                <span class="font-medium text-foreground">{{ name }}</span>
                <span class="text-muted-foreground mx-1">·</span>
                <span :class="cfg.disabled ? 'text-muted-foreground' : statusColor(mcpStatusOf(name as string)?.status)">
                  {{ cfg.disabled ? '未启用' : (isServerInitializing(name as string) ? '初始化中' : statusLabel(mcpStatusOf(name as string)?.status)) }}
                </span>
                <template v-if="mcpStatusOf(name as string)?.tools?.length">
                  <span class="text-muted-foreground mx-1">·</span>
                  <span class="text-muted-foreground">{{ mcpStatusOf(name as string)!.tools.length }} 工具</span>
                </template>
              </div>

              <!-- 展开工具 -->
              <button
                v-if="!isServerInitializing(name as string) && mcpStatusOf(name as string)?.tools?.length"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                @click="toggleToolsExpanded(name as string)"
              >
                <div
                  class="i-carbon-chevron-down h-3 w-3 transition-transform flex-shrink-0"
                  :class="{ 'rotate-180': expandedTools.has(name as string) }"
                />
                <span>{{ expandedTools.has(name as string) ? '收起' : '展开工具列表' }}</span>
              </button>

              <!-- 操作 -->
              <div v-if="!isServerInitializing(name as string)" class="flex items-center gap-0.5 flex-shrink-0">
                <Switch
                  :model-value="!cfg.disabled"
                  :disabled="isMcpSaving"
                  :title="cfg.disabled ? '启用' : '禁用'"
                  @update:model-value="toggleDisabled(name as string)"
                />
                <button
                  class="btn-ghost btn-icon ml-2"
                  title="重启"
                  @click="onRestartOne(name as string)"
                >
                  <div class="i-carbon-renew h-3.5 w-3.5" />
                </button>
                <button
                  class="btn-ghost btn-icon text-red-400 hover:text-red-300 hover:bg-destructive/20"
                  title="删除"
                  @click="removeServer(name as string)"
                >
                  <div class="i-carbon-trash-can h-3.5 w-3.5" />
                </button>
              </div>
              <div v-else class="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                <span class="i-carbon-circle-dash h-3 w-3 animate-spin" />
                初始化中
              </div>
            </div>

            <!-- 错误信息 -->
            <div
              v-if="mcpStatusOf(name as string)?.error"
              class="border-t border-border px-3 py-2 text-xs text-red-500/80 break-words"
            >
              {{ mcpStatusOf(name as string)!.error }}
            </div>

            <!-- 展开的工具列表 -->
            <div
              v-if="expandedTools.has(name as string) && mcpStatusOf(name as string)?.tools?.length"
              class="border-t border-border px-3 py-2 bg-muted/20"
            >
              <div class="text-xs text-muted-foreground mb-1.5">
                工具列表
              </div>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="tool in mcpStatusOf(name as string)!.tools"
                  :key="tool"
                  class="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-xs font-mono text-foreground/90"
                >
                  {{ tool }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 添加表单 -->
        <div v-if="showAddForm" class="mt-3 rounded-lg border border-border p-3 space-y-3">
          <div class="grid gap-1.5">
            <label class="text-xs text-muted-foreground">名称</label>
            <input v-model="newServer.name" class="input-field" type="text" placeholder="my-mcp-server">
          </div>

          <!-- Transport 模式切换 -->
          <div class="flex gap-1 rounded-md border border-border p-0.5">
            <button
              class="flex-1 px-2 py-1 rounded text-xs transition-colors"
              :class="newServerMode === 'stdio' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'"
              @click="newServerMode = 'stdio'"
            >
              Stdio（本地命令）
            </button>
            <button
              class="flex-1 px-2 py-1 rounded text-xs transition-colors"
              :class="newServerMode === 'url' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'"
              @click="newServerMode = 'url'"
            >
              SSE / HTTP（远程 URL）
            </button>
          </div>

          <!-- Stdio 模式 -->
          <template v-if="newServerMode === 'stdio'">
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">命令</label>
              <input v-model="newServer.command" class="input-field font-mono" type="text" placeholder="npx">
            </div>
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">参数（空格分隔）</label>
              <input v-model="newServer.args" class="input-field font-mono" type="text" placeholder="-y @modelcontextprotocol/server-filesystem">
            </div>
          </template>

          <!-- URL 模式 -->
          <template v-else>
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">URL</label>
              <input v-model="newServer.url" class="input-field font-mono" type="text" placeholder="https://mcp.example.com/mcp">
            </div>
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">协议</label>
              <div class="relative">
                <select v-model="newServer.transportType" class="select-field">
                  <option value="http">
                    Streamable HTTP
                  </option>
                  <option value="sse">
                    SSE（Server-Sent Events）
                  </option>
                </select>
                <div class="i-ic:twotone-keyboard-arrow-down absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">
                Headers
                <span class="text-muted-foreground/50 ml-1">（可选，每行一个 Key: Value）</span>
              </label>
              <textarea
                v-model="newServer.headersText"
                class="input-field font-mono text-xs resize-y"
                rows="3"
                spellcheck="false"
                placeholder="Authorization: Bearer sk-xxx&#10;X-Custom-Header: value"
              />
            </div>
          </template>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button class="btn-ghost btn-sm" @click="showAddForm = false; resetAddForm()">
              取消
            </button>
            <button class="btn-primary btn-sm" @click="addServer">
              添加
            </button>
          </div>
        </div>

        <button
          v-if="!showAddForm"
          class="btn-ghost btn-sm mt-3 w-full"
          @click="showAddForm = true"
        >
          <div class="i-carbon-add h-3.5 w-3.5 mr-1" />
          添加 MCP Server
        </button>
      </template>

      <div v-if="isMcpLogPanelOpen" class="mt-3 rounded-lg border border-border">
        <div class="px-3 py-2 flex items-center justify-between">
          <div class="text-xs font-medium text-foreground">
            MCP 日志（最近 1000 行）
          </div>
          <button
            class="btn-ghost btn-sm"
            :disabled="isMcpLogsLoading"
            @click="loadMCPLogs"
          >
            <span v-if="isMcpLogsLoading" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1.5" />
            刷新
          </button>
        </div>
        <div class="border-t border-border p-3">
          <div v-if="isMcpLogsLoading" class="text-xs text-muted-foreground">
            正在加载日志...
          </div>
          <div v-else-if="mcpLogs.length === 0" class="text-xs text-muted-foreground">
            暂无 MCP 日志
          </div>
          <pre
            v-else
            class="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-foreground/90"
          >{{ mcpLogs.join('\n') }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>
