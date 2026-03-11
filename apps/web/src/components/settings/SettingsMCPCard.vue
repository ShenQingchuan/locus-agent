<script setup lang="ts">
import { Switch } from '@univedge/locus-ui'
import MonacoEditor from '@/components/code/MonacoEditor.vue'
import { statusColor, statusLabel, useMCPManager } from '@/composables/useMCPManager'

const {
  mcpServers,
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
  mcpStatusOf,
  isServerInitializing,
  syncJsonText,
  onJsonInput,
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
} = useMCPManager()
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
