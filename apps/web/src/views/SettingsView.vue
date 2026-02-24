<script setup lang="ts">
import type { LLMProviderType, MCPServerConfig, MCPServerStatus, WhitelistRule } from '@locus-agent/shared'
import { DEFAULT_API_BASES, getRiskLevel, LLM_PROVIDERS } from '@locus-agent/shared'
import { Switch, useToast } from '@locus-agent/ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  deleteWhitelistRule,
  fetchMCPConfig,
  fetchMCPStatus,
  fetchSettingsConfig,
  fetchWhitelistRules,
  restartMCPServer,
  updateMCPConfig,
  updateSettingsConfig,
} from '@/api/chat'
import MonacoEditor from '@/components/MonacoEditor.vue'

const router = useRouter()
const toast = useToast()

const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref<string | null>(null)
const requiresRestart = ref(false)

const runtimeInfo = ref<{ provider: string, model: string, contextWindow: number } | null>(null)
const currentApiKeyMasked = ref<string | null>(null)
const apiKeysMasked = ref<Partial<Record<LLMProviderType, string | null>>>({})

const form = ref({
  provider: 'openai' as LLMProviderType,
  apiKey: '',
  apiBase: '',
  port: 3000,
})

const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.value, label: p.label }))

const hasExistingApiKey = computed(() => {
  return !!currentApiKeyMasked.value
})

const apiKeyPlaceholder = computed(() => {
  if (!hasExistingApiKey.value)
    return '请输入 API Key'
  return currentApiKeyMasked.value || '**************'
})

const apiKeyHelperText = computed(() => {
  return hasExistingApiKey.value ? '' : '首次配置请填写 API Key'
})

const apiBasePlaceholder = computed(() => DEFAULT_API_BASES[form.value.provider])

watch(() => form.value.provider, (provider) => {
  if (isLoading.value)
    return
  form.value.apiBase = DEFAULT_API_BASES[provider] ?? ''
  form.value.apiKey = ''
  currentApiKeyMasked.value = apiKeysMasked.value[provider] ?? null
})

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

const mcpServers = ref<Record<string, MCPServerConfig>>({})
const mcpStatus = ref<MCPServerStatus[]>([])
const mcpJsonMode = ref(false)
const mcpJsonText = ref('')
const mcpJsonError = ref<string | null>(null)
const isMcpSaving = ref(false)
const isMcpRestarting = ref(false)

/** 已展开工具列表的 server 名称集合 */
const expandedTools = ref<Set<string>>(new Set())

/** 添加新 server 的临时表单 */
const showAddForm = ref(false)
const newServerMode = ref<'stdio' | 'url'>('stdio')
const newServer = ref({ name: '', command: '', args: '', url: '', transportType: 'sse' as 'sse' | 'http', headersText: '' })

function mcpStatusOf(name: string): MCPServerStatus | undefined {
  return mcpStatus.value.find(s => s.name === name)
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
    default: return '未连接'
  }
}

async function loadMCP() {
  const [config, status] = await Promise.all([
    fetchMCPConfig(),
    fetchMCPStatus(),
  ])
  mcpServers.value = config?.mcpServers ?? {}
  mcpStatus.value = status
  syncJsonText()
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
    if (result.status)
      mcpStatus.value = result.status
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
    if (result.status)
      mcpStatus.value = result.status
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
  if (result.status)
    mcpStatus.value = result.status
}

function resetAddForm() {
  newServer.value = { name: '', command: '', args: '', url: '', transportType: 'sse', headersText: '' }
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

function addServer() {
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
}

function removeServer(name: string) {
  delete mcpServers.value[name]
  mcpServers.value = { ...mcpServers.value }
  syncJsonText()
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
    if (result.status)
      mcpStatus.value = result.status
  }
  finally {
    isMcpSaving.value = false
  }
}

// ---------------------------------------------------------------------------
// Whitelist
// ---------------------------------------------------------------------------

const wlRules = ref<WhitelistRule[]>([])
const isWlLoading = ref(false)

async function loadWhitelist() {
  isWlLoading.value = true
  try {
    wlRules.value = await fetchWhitelistRules()
  }
  catch (error) {
    console.error('Failed to load whitelist rules:', error)
  }
  finally {
    isWlLoading.value = false
  }
}

async function onDeleteWhitelistRule(ruleId: string) {
  const success = await deleteWhitelistRule(ruleId)
  if (success) {
    wlRules.value = wlRules.value.filter(r => r.id !== ruleId)
    toast.success('白名单规则已删除')
  }
  else {
    toast.error('删除失败')
  }
}

function wlRiskLabel(rule: WhitelistRule): { text: string, class: string } {
  const risk = getRiskLevel(rule.toolName, rule.pattern)
  switch (risk) {
    case 'dangerous':
      return { text: '危险', class: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/50' }
    case 'moderate':
      return { text: '中等', class: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950/50' }
    default:
      return { text: '安全', class: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950/50' }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  loadConfig()
  loadMCP()
  loadWhitelist()
})

async function loadConfig() {
  isLoading.value = true
  loadError.value = null
  try {
    const config = await fetchSettingsConfig()
    if (!config) {
      loadError.value = '加载配置失败'
      return
    }

    form.value.provider = config.provider
    form.value.apiBase = config.apiBase || DEFAULT_API_BASES[config.provider] || ''
    form.value.port = config.port

    apiKeysMasked.value = config.apiKeys ?? {}
    currentApiKeyMasked.value = apiKeysMasked.value[config.provider] ?? config.apiKeyMasked ?? null
    runtimeInfo.value = config.runtime ?? null
    requiresRestart.value = false
  }
  catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载配置失败'
  }
  finally {
    await nextTick()
    isLoading.value = false
  }
}

async function saveConfig() {
  if (isSaving.value)
    return

  isSaving.value = true
  try {
    const port = Number(form.value.port)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error('端口必须是 1-65535 之间的数字')
      return
    }

    const apiBase = form.value.apiBase.trim()

    const payload: {
      provider: LLMProviderType
      apiKey?: string
      apiBase: string
      port: number
    } = {
      provider: form.value.provider,
      apiBase,
      port,
    }

    const trimmedKey = form.value.apiKey.trim()
    if (!trimmedKey && !currentApiKeyMasked.value) {
      toast.error('API Key 不能为空')
      return
    }
    if (trimmedKey)
      payload.apiKey = trimmedKey

    const result = await updateSettingsConfig(payload)
    if (!result.success) {
      toast.error(result.message || '保存失败')
      return
    }

    toast.success('设置已保存')
    requiresRestart.value = !!result.requiresRestart

    form.value.apiKey = ''
    if (result.config) {
      apiKeysMasked.value = result.config.apiKeys ?? apiKeysMasked.value
      currentApiKeyMasked.value = apiKeysMasked.value[form.value.provider] ?? result.config.apiKeyMasked ?? currentApiKeyMasked.value
      runtimeInfo.value = result.config.runtime ?? runtimeInfo.value
    }
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 flex flex-col min-w-0">
      <header class="flex-shrink-0 border-b border-border bg-background px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            class="btn-ghost btn-icon"
            title="返回"
            @click="router.push({ name: 'chat' })"
          >
            <div class="i-carbon-arrow-left h-4 w-4" />
          </button>
          <h1 class="text-sm font-medium text-foreground">
            设置
          </h1>
        </div>

        <div class="flex items-center gap-1">
          <button
            class="btn-ghost btn-icon"
            title="刷新"
            :disabled="isLoading || isSaving"
            @click="loadConfig"
          >
            <div class="i-carbon-renew h-4 w-4" />
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <div class="container-chat p-4 space-y-6">
          <div
            v-if="isLoading"
            class="flex-col-center py-12 text-muted-foreground"
          >
            <div class="i-carbon-circle-dash h-6 w-6 animate-spin opacity-50" />
            <span class="text-xs mt-2 opacity-70">加载中...</span>
          </div>

          <div
            v-else-if="loadError"
            class="alert alert-destructive"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="text-sm">
                {{ loadError }}
              </div>
              <button class="btn-outline btn-sm" @click="loadConfig">
                重试
              </button>
            </div>
          </div>

          <template v-else>
            <!-- LLM -->
            <section class="card p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-sm font-medium text-foreground">
                    模型配置
                  </h2>
                  <p class="text-xs text-muted-foreground mt-1">
                    保存后会立即影响新的对话请求。
                  </p>
                </div>
                <div
                  v-if="runtimeInfo"
                  class="text-xs text-gray-400 text-right"
                >
                  <div>
                    运行中：
                    <span class="font-mono">{{ runtimeInfo.provider }} · {{ runtimeInfo.model }}</span>
                  </div>
                  <div>上下文窗口：{{ runtimeInfo.contextWindow }}</div>
                </div>
              </div>

              <div class="mt-4 grid gap-4">
                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">提供方</label>
                  <select v-model="form.provider" class="input-field">
                    <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">API Key</label>
                  <input
                    v-model="form.apiKey"
                    class="input-field font-mono"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="apiKeyPlaceholder"
                  >
                  <p v-if="apiKeyHelperText" class="text-xs text-muted-foreground">
                    {{ apiKeyHelperText }}
                  </p>
                </div>

                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">API Base URL</label>
                  <input
                    v-model="form.apiBase"
                    class="input-field"
                    type="text"
                    :placeholder="apiBasePlaceholder"
                  >
                </div>
              </div>
              <p class="mt-3 text-xs text-muted-foreground/60">
                模型名称可在对话界面底部直接切换。
              </p>
            </section>

            <!-- Server -->
            <section class="card p-4">
              <div>
                <h2 class="text-sm font-medium text-foreground">
                  服务端
                </h2>
                <p class="text-xs text-muted-foreground mt-1">
                  端口修改需要重启后生效。
                </p>
              </div>

              <div class="mt-4 grid gap-4">
                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">端口</label>
                  <input
                    v-model.number="form.port"
                    class="input-field"
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="3000"
                  >
                </div>

                <div
                  v-if="requiresRestart"
                  class="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                >
                  端口已保存，重启服务后生效。
                </div>
              </div>
            </section>

            <!-- MCP Servers -->
            <section class="card p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-sm font-medium text-foreground">
                    MCP Servers
                  </h2>
                  <p class="text-xs text-muted-foreground mt-1">
                    配置外部 MCP 工具服务，格式兼容 Cursor / Claude Code。
                  </p>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="btn-ghost btn-icon"
                    title="JSON 编辑"
                    :class="{ 'text-primary': mcpJsonMode }"
                    @click="mcpJsonMode = !mcpJsonMode; syncJsonText()"
                  >
                    <div class="i-carbon-code h-4 w-4" />
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
                  <p class="text-xs text-muted-foreground/60 mt-1">
                    可直接粘贴 Cursor / Claude Code 的 mcp.json 内容。
                  </p>
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
                            'bg-yellow-500': !cfg.disabled && mcpStatusOf(name as string)?.status === 'connecting',
                            'bg-red-500': !cfg.disabled && mcpStatusOf(name as string)?.status === 'error',
                            'bg-muted-foreground/30': cfg.disabled || !mcpStatusOf(name as string) || mcpStatusOf(name as string)?.status === 'disconnected',
                          }"
                          :title="cfg.disabled ? '未启用' : (mcpStatusOf(name as string)?.error || statusLabel(mcpStatusOf(name as string)?.status))"
                        />

                        <!-- 主行：名字 · 状态 · 工具数 -->
                        <div class="flex-1 min-w-0 text-xs">
                          <span class="font-medium text-foreground">{{ name }}</span>
                          <span class="text-muted-foreground mx-1">·</span>
                          <span :class="cfg.disabled ? 'text-muted-foreground' : statusColor(mcpStatusOf(name as string)?.status)">
                            {{ cfg.disabled ? '未启用' : statusLabel(mcpStatusOf(name as string)?.status) }}
                          </span>
                          <template v-if="mcpStatusOf(name as string)?.tools?.length">
                            <span class="text-muted-foreground mx-1">·</span>
                            <span class="text-muted-foreground">{{ mcpStatusOf(name as string)!.tools.length }} 工具</span>
                          </template>
                          <template v-if="mcpStatusOf(name as string)?.error">
                            <span class="text-muted-foreground mx-1">·</span>
                            <span class="text-red-500/80 truncate" :title="mcpStatusOf(name as string)!.error">{{ mcpStatusOf(name as string)!.error }}</span>
                          </template>
                        </div>

                        <!-- 展开工具 -->
                        <button
                          v-if="mcpStatusOf(name as string)?.tools?.length"
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          @click="toggleToolsExpanded(name)"
                        >
                          <div
                            class="i-carbon-chevron-down h-3 w-3 transition-transform flex-shrink-0"
                            :class="{ 'rotate-180': expandedTools.has(name) }"
                          />
                          <span>{{ expandedTools.has(name) ? '收起' : '展开工具列表' }}</span>
                        </button>

                        <!-- 操作 -->
                        <div class="flex items-center gap-0.5 flex-shrink-0">
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
                      </div>

                      <!-- 展开的工具列表 -->
                      <div
                        v-if="expandedTools.has(name) && mcpStatusOf(name as string)?.tools?.length"
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
                        <input v-model="newServer.url" class="input-field font-mono" type="text" placeholder="https://mcp.example.com/sse">
                      </div>
                      <div class="grid gap-1.5">
                        <label class="text-xs text-muted-foreground">协议</label>
                        <select v-model="newServer.transportType" class="input-field">
                          <option value="sse">
                            SSE（Server-Sent Events）
                          </option>
                          <option value="http">
                            Streamable HTTP
                          </option>
                        </select>
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
              </div>

              <!-- MCP 保存按钮 -->
              <div class="mt-4 flex items-center justify-end">
                <button
                  class="btn-primary btn-sm"
                  :disabled="isMcpSaving"
                  @click="saveMCP"
                >
                  <span v-if="isMcpSaving" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1.5" />
                  保存 MCP 配置
                </button>
              </div>
            </section>

            <!-- Whitelist Management -->
            <section class="card p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-sm font-semibold text-foreground">
                    全局工具执行白名单
                  </h2>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    对所有会话生效的自动放行规则
                  </p>
                </div>
                <button
                  class="btn-ghost btn-icon"
                  title="刷新"
                  :disabled="isWlLoading"
                  @click="loadWhitelist"
                >
                  <div class="i-carbon-renew h-4 w-4" :class="isWlLoading ? 'animate-spin' : ''" />
                </button>
              </div>

              <div class="mt-4">
                <div v-if="isWlLoading" class="flex-col-center py-6 text-muted-foreground">
                  <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
                  <span class="text-xs mt-1.5 opacity-70">加载中...</span>
                </div>

                <div v-else-if="wlRules.length === 0" class="py-6 text-center">
                  <div class="i-carbon-filter h-8 w-8 mx-auto text-muted-foreground/30" />
                  <p class="text-xs text-muted-foreground/60 mt-2">
                    暂无白名单规则
                  </p>
                  <p class="text-[10px] text-muted-foreground/40 mt-0.5">
                    在工具审批时可添加
                  </p>
                </div>

                <div v-else class="flex flex-wrap gap-2">
                  <div
                    v-for="rule in wlRules"
                    :key="rule.id"
                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-muted/30 group leading-none"
                  >
                    <code
                      class="text-xs font-mono leading-none"
                      :class="wlRiskLabel(rule).text === '危险' ? 'text-red-500 dark:text-red-400' : 'text-foreground'"
                    >{{ rule.toolName }}<span v-if="rule.pattern" class="text-muted-foreground ml-1">{{ rule.pattern }}</span></code>
                    <button
                      class="h-4 w-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      title="删除"
                      @click="onDeleteWhitelistRule(rule.id)"
                    >
                      <div class="i-carbon-close h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <div class="flex items-center justify-end gap-2">
              <button
                class="btn-ghost"
                :disabled="isSaving"
                @click="router.push({ name: 'chat' })"
              >
                返回
              </button>
              <button
                class="btn-primary"
                :disabled="isSaving"
                @click="saveConfig"
              >
                <span v-if="isSaving" class="i-carbon-circle-dash h-4 w-4 animate-spin mr-2" />
                保存
              </button>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>
