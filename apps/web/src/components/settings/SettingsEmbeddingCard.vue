<script setup lang="ts">
import type {
  EmbeddingProvider,
  EmbeddingStatus,
} from '@/api/embedding'
import { useToast } from '@locus-agent/ui'
import { useThrottleFn } from '@vueuse/core'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useEmbeddingTasks } from '@/composables/useEmbeddingTasks'

const toast = useToast()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const embeddingState = ref<EmbeddingStatus>({
  status: 'loading' as any,
  indexedCount: 0,
  indexedWith: null,
  vecAvailable: true,
  embeddingConfigured: false,
  provider: 'zhipu',
  localModelReady: false,
  localModelFiles: [],
  localRuntimeInstalled: false,
})

const embeddingProgress = ref<{
  indexedCount?: number
  totalCount?: number
  percent?: number
}>({})

const embeddingBusy = ref(false)
const providerSwitching = ref(false)

const runtimeUninstalling = ref(false)
const modelDeleting = ref(false)
const installOutputEl = ref<HTMLPreElement | null>(null)

const {
  runtimeInstalling,
  runtimeInstallOutput,
  modelDownloading,
  downloadFileList,
  runtimeInstallCompletedAt,
  modelDownloadCompletedAt,
  startRuntimeInstall,
  startModelDownload,
} = useEmbeddingTasks()

function scrollInstallOutputToBottom() {
  nextTick(() => {
    if (installOutputEl.value)
      installOutputEl.value.scrollTop = installOutputEl.value.scrollHeight
  })
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const activeProvider = computed(() => embeddingState.value.provider)

const PROVIDER_LABELS: Record<EmbeddingProvider, string> = {
  zhipu: '智谱 embedding-3',
  local: 'Qwen3-Embedding-0.6B',
}

const indexedWithLabel = computed(() => {
  const p = embeddingState.value.indexedWith
  return p ? PROVIDER_LABELS[p] : null
})

/** True when there are indexed notes from a DIFFERENT provider */
const hasMismatchedIndex = computed(() => {
  const { indexedCount, indexedWith } = embeddingState.value
  return indexedCount > 0 && indexedWith !== null && indexedWith !== activeProvider.value
})

const embeddingStatusLabel = computed(() => {
  switch (embeddingState.value.status) {
    case 'loading' as any: return '加载中...'
    case 'not_configured': return '未配置'
    case 'indexing': return '索引中...'
    case 'ready': return '已就绪'
    case 'error': return '错误'
    default: return '未知'
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// ---------------------------------------------------------------------------
// API actions
// ---------------------------------------------------------------------------

async function loadEmbeddingStatus() {
  try {
    const { fetchEmbeddingStatus } = await import('@/api/embedding')
    const status = await fetchEmbeddingStatus()
    embeddingState.value = status
  }
  catch {
    embeddingState.value.status = 'not_configured'
  }
}

async function switchProvider(provider: EmbeddingProvider) {
  if (provider === activeProvider.value || providerSwitching.value)
    return
  providerSwitching.value = true
  try {
    const { setEmbeddingProvider } = await import('@/api/embedding')
    const result = await setEmbeddingProvider(provider)
    embeddingState.value = result
  }
  catch (err) {
    toast.error(`切换失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
  finally {
    providerSwitching.value = false
  }
}

async function handleDeleteModel() {
  if (modelDeleting.value)
    return

  modelDeleting.value = true
  try {
    const { deleteModel } = await import('@/api/embedding')
    await deleteModel()
    toast.success('模型已删除')
    await loadEmbeddingStatus()
  }
  catch (err) {
    toast.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
  finally {
    modelDeleting.value = false
  }
}

async function handleUninstallRuntime() {
  if (runtimeUninstalling.value)
    return

  runtimeUninstalling.value = true
  try {
    const { uninstallRuntime } = await import('@/api/embedding')
    await uninstallRuntime()
    toast.success('ONNX 运行时已卸载')
    await loadEmbeddingStatus()
  }
  catch (err) {
    toast.error(`卸载失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
  finally {
    runtimeUninstalling.value = false
  }
}

const onReindex = useThrottleFn(async () => {
  embeddingBusy.value = true
  embeddingProgress.value = {}
  embeddingState.value.status = 'indexing'

  const { startReindex } = await import('@/api/embedding')
  startReindex(
    (data) => {
      embeddingProgress.value = {
        indexedCount: data.indexedCount,
        totalCount: data.totalCount,
        percent: data.percent,
      }
    },
    () => {
      embeddingBusy.value = false
      toast.success('索引完成')
      loadEmbeddingStatus()
    },
    (msg) => {
      embeddingState.value.status = 'error'
      embeddingState.value.error = msg
      embeddingBusy.value = false
      toast.error(`索引失败: ${msg}`)
    },
  )
}, 2000)

async function onDismissError() {
  try {
    const { clearEmbeddingError } = await import('@/api/embedding')
    await clearEmbeddingError()
  }
  catch { /* clear frontend state even if API fails */ }
  await loadEmbeddingStatus()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

watch(runtimeInstallOutput, () => {
  if (runtimeInstalling.value)
    scrollInstallOutputToBottom()
})

watch(runtimeInstallCompletedAt, (value, oldValue) => {
  if (value && value !== oldValue)
    void loadEmbeddingStatus()
})

watch(modelDownloadCompletedAt, (value, oldValue) => {
  if (value && value !== oldValue)
    void loadEmbeddingStatus()
})

onMounted(() => {
  loadEmbeddingStatus()
  scrollInstallOutputToBottom()
})
</script>

<template>
  <section class="card p-4">
    <!-- Header -->
    <div>
      <h2 class="text-sm font-semibold text-foreground">
        Embedding
      </h2>
      <p class="text-xs text-muted-foreground mt-0.5">
        向量嵌入模型，用于语义搜索
      </p>
    </div>

    <!-- Indexed count summary (always visible when > 0) -->
    <div v-if="embeddingState.indexedCount > 0" class="mt-3 flex items-center gap-2 text-xs">
      <span class="inline-block h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
      <span class="text-foreground">
        已索引 {{ embeddingState.indexedCount }} 条笔记
      </span>
      <span v-if="indexedWithLabel" class="text-muted-foreground">
        · {{ indexedWithLabel }}
      </span>
    </div>

    <!-- Provider selector -->
    <div class="mt-3 flex gap-2">
      <button
        class="flex-1 relative rounded-lg border px-3 py-2 text-left transition-all"
        :class="activeProvider === 'zhipu'
          ? 'border-foreground/15 bg-muted/50'
          : 'border-border hover:border-foreground/10 hover:bg-muted/30'"
        :disabled="providerSwitching"
        @click="switchProvider('zhipu')"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-foreground">智谱 embedding-3</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500/80 font-medium">
            API 计费
          </span>
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">
          1024 维 · 云端推理
        </div>
      </button>

      <button
        class="flex-1 relative rounded-lg border px-3 py-2 text-left transition-all"
        :class="activeProvider === 'local'
          ? 'border-foreground/15 bg-muted/50'
          : 'border-border hover:border-foreground/10 hover:bg-muted/30'"
        :disabled="providerSwitching"
        @click="switchProvider('local')"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-foreground">Qwen3-Embedding-0.6B</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500/80 font-medium">
            本地
          </span>
        </div>
        <div class="text-[11px] text-muted-foreground mt-0.5">
          1024 维 · ONNX 离线推理
        </div>
      </button>
    </div>

    <div class="mt-4 space-y-3">
      <!-- sqlite-vec unavailable -->
      <div v-if="!embeddingState.vecAvailable && embeddingState.status !== ('loading' as any)" class="alert alert-destructive text-xs">
        <div class="i-carbon-warning-alt h-4 w-4 mr-1.5 flex-shrink-0" />
        <span>sqlite-vec 扩展不可用，语义搜索功能已禁用</span>
      </div>

      <!-- Loading -->
      <div v-else-if="embeddingState.status === ('loading' as any)" class="flex-col-center py-4 text-muted-foreground">
        <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
        <span class="text-xs mt-1.5 opacity-70">加载中...</span>
      </div>

      <template v-else>
        <!-- ==================== Zhipu provider ==================== -->
        <template v-if="activeProvider === 'zhipu'">
          <div v-if="embeddingState.status === 'not_configured'" class="rounded-lg border border-border bg-muted/30 p-3 text-xs flex items-start gap-1.5">
            <div class="i-carbon-information h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span class="text-muted-foreground">请在左侧 LLM 设置中配置智谱（Zhipu）API Key 以启用语义搜索</span>
          </div>
        </template>

        <!-- ==================== Local provider ==================== -->
        <template v-if="activeProvider === 'local'">
          <!-- Runtime not installed -->
          <template v-if="!embeddingState.localRuntimeInstalled && !runtimeInstalling">
            <div class="rounded-lg border border-border bg-muted/30 p-3 text-xs flex items-start gap-1.5">
              <div class="i-carbon-information h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span class="text-muted-foreground">需要安装 ONNX 推理运行时（约 150 MB）</span>
            </div>
            <button
              class="btn-primary btn-sm"
              @click="startRuntimeInstall"
            >
              <div class="i-carbon-download h-3.5 w-3.5 mr-1" />
              安装运行时
            </button>
          </template>

          <!-- Runtime installing -->
          <div v-if="runtimeInstalling" class="space-y-2">
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <div class="i-carbon-circle-dash h-4 w-4 animate-spin flex-shrink-0" />
              <span>正在安装 ONNX 运行时...</span>
            </div>
            <pre
              ref="installOutputEl"
              class="rounded-lg border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground h-36 overflow-y-auto font-mono whitespace-pre-wrap"
            >{{ runtimeInstallOutput || ' ' }}</pre>
          </div>

          <!-- Model not downloaded (runtime installed) -->
          <template v-if="embeddingState.localRuntimeInstalled && !embeddingState.localModelReady && !modelDownloading">
            <div class="rounded-lg border border-border bg-muted/30 p-3 text-xs flex items-start gap-1.5">
              <div class="i-carbon-information h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span class="text-muted-foreground">需要下载模型文件到本地（约 700 MB）</span>
            </div>
            <button
              class="btn-primary btn-sm"
              @click="startModelDownload"
            >
              <div class="i-carbon-download h-3.5 w-3.5 mr-1" />
              下载模型
            </button>
          </template>

          <!-- Model downloading - file table -->
          <template v-if="embeddingState.localRuntimeInstalled && modelDownloading && downloadFileList.length > 0">
            <div class="rounded-lg border border-border overflow-hidden">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-border bg-muted/30">
                    <th class="text-[11px] font-medium text-muted-foreground text-left px-3 py-1.5">
                      文件
                    </th>
                    <th class="text-[11px] font-medium text-muted-foreground text-right px-3 py-1.5 w-20">
                      大小
                    </th>
                    <th class="text-[11px] font-medium text-muted-foreground text-right px-3 py-1.5 w-16">
                      进度
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="file in downloadFileList"
                    :key="file.name"
                    class="border-b border-border/50 last:border-b-0"
                  >
                    <td class="text-xs font-mono text-foreground/80 px-3 py-1.5 truncate max-w-[200px]" :title="file.name">
                      {{ file.name }}
                    </td>
                    <td class="text-[11px] text-muted-foreground text-right px-3 py-1.5 tabular-nums whitespace-nowrap">
                      {{ file.total > 0 ? formatFileSize(file.total) : '—' }}
                    </td>
                    <td class="text-[11px] text-right px-3 py-1.5 tabular-nums whitespace-nowrap">
                      <span v-if="file.status === 'done'" class="text-green-500 font-medium">
                        ✓
                      </span>
                      <span v-else-if="file.status === 'progress' || file.status === 'download'" class="text-blue-500 font-medium">
                        {{ Math.round(file.progress) }}%
                      </span>
                      <span v-else class="text-muted-foreground">
                        等待
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <!-- Model downloading - spinner (no files yet) -->
          <div v-else-if="embeddingState.localRuntimeInstalled && modelDownloading" class="flex items-center gap-2 py-1 text-xs text-muted-foreground">
            <div class="i-carbon-circle-dash h-4 w-4 animate-spin" />
            <span>正在初始化下载...</span>
          </div>

          <!-- Model downloaded - file list -->
          <template v-if="embeddingState.localRuntimeInstalled && embeddingState.localModelReady && !modelDownloading">
            <div v-if="embeddingState.localModelFiles.length > 0" class="rounded-lg border border-border overflow-hidden">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-border bg-muted/30">
                    <th class="text-[11px] font-medium text-muted-foreground text-left px-3 py-1.5">
                      文件
                    </th>
                    <th class="text-[11px] font-medium text-muted-foreground text-right px-3 py-1.5 w-20">
                      大小
                    </th>
                    <th class="text-[11px] font-medium text-muted-foreground text-right px-3 py-1.5 w-16">
                      状态
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="file in embeddingState.localModelFiles"
                    :key="file.name"
                    class="border-b border-border/50 last:border-b-0"
                  >
                    <td class="text-xs font-mono text-foreground/80 px-3 py-1.5 truncate max-w-[200px]" :title="file.name">
                      {{ file.name }}
                    </td>
                    <td class="text-[11px] text-muted-foreground text-right px-3 py-1.5 tabular-nums whitespace-nowrap">
                      {{ formatFileSize(file.size) }}
                    </td>
                    <td class="text-[11px] text-green-500 font-medium text-right px-3 py-1.5">
                      ✓
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>

        <!-- ==================== Common: status & indexing ==================== -->

        <!-- Error -->
        <div v-if="embeddingState.status === 'error' && embeddingState.error" class="alert alert-destructive text-xs flex items-start justify-between gap-2">
          <span class="break-all">{{ embeddingState.error }}</span>
          <button
            class="flex-shrink-0 p-0.5 rounded hover:bg-destructive/15 transition-colors"
            title="关闭"
            @click="onDismissError"
          >
            <div class="i-carbon-close h-3.5 w-3.5" />
          </button>
        </div>

        <!-- Mismatched index warning -->
        <div v-if="hasMismatchedIndex" class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs flex items-start gap-1.5">
          <div class="i-carbon-warning-alt h-4 w-4 flex-shrink-0 text-amber-500" />
          <span class="text-muted-foreground">
            已有索引由 <strong class="text-foreground">{{ indexedWithLabel }}</strong> 生成，当前模型不同，搜索结果可能不准确。请重新索引。
          </span>
        </div>

        <!-- Indexing progress -->
        <div v-if="embeddingState.status === 'indexing'" class="flex items-center gap-2.5 py-1">
          <svg class="h-5 w-5 -rotate-90 flex-shrink-0" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.5" class="text-muted/50" />
            <circle
              cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.5"
              class="text-blue-500 transition-all duration-300"
              stroke-linecap="round"
              :stroke-dasharray="`${2 * Math.PI * 8}`"
              :stroke-dashoffset="`${2 * Math.PI * 8 * (1 - (embeddingProgress.percent || 0) / 100)}`"
            />
          </svg>
          <span class="text-xs text-muted-foreground">
            <template v-if="embeddingProgress.totalCount">
              正在索引 {{ embeddingProgress.indexedCount || 0 }} / {{ embeddingProgress.totalCount }} 条笔记
            </template>
            <template v-else>
              正在准备索引...
            </template>
          </span>
        </div>

        <!-- Status + Action row -->
        <div v-if="embeddingState.status !== 'indexing'" class="flex items-center justify-between pt-1">
          <!-- Status indicator -->
          <div v-if="embeddingState.embeddingConfigured && !hasMismatchedIndex" class="flex items-center gap-2">
            <span
              class="inline-block h-2 w-2 rounded-full"
              :class="{
                'bg-gray-400': embeddingState.status === 'not_configured',
                'bg-green-500': embeddingState.status === 'ready',
                'bg-red-500': embeddingState.status === 'error',
              }"
            />
            <span class="text-xs text-foreground">{{ embeddingStatusLabel }}</span>
          </div>
          <div v-else />

          <!-- Action buttons -->
          <div class="flex gap-2">
            <button
              v-if="activeProvider === 'local' && embeddingState.localRuntimeInstalled && !runtimeInstalling"
              class="btn-outline btn-sm text-destructive hover:bg-destructive/10"
              :disabled="runtimeUninstalling || modelDownloading"
              @click="handleUninstallRuntime"
            >
              <div v-if="runtimeUninstalling" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
              <div v-else class="i-carbon-trash-can h-3.5 w-3.5 mr-1" />
              卸载运行时
            </button>

            <button
              v-if="activeProvider === 'local' && embeddingState.localModelReady && !modelDownloading"
              class="btn-outline btn-sm text-destructive hover:bg-destructive/10"
              :disabled="modelDeleting"
              @click="handleDeleteModel"
            >
              <div v-if="modelDeleting" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
              <div v-else class="i-carbon-trash-can h-3.5 w-3.5 mr-1" />
              删除模型
            </button>

            <button
              v-if="embeddingState.embeddingConfigured && (embeddingState.status === 'ready' || embeddingState.status === 'not_configured' || hasMismatchedIndex)"
              class="btn-outline btn-sm"
              :disabled="embeddingBusy"
              @click="onReindex"
            >
              <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
              {{ embeddingState.indexedCount > 0 ? '重新索引' : '开始索引' }}
            </button>

            <button
              v-if="embeddingState.status === 'error' && embeddingState.embeddingConfigured"
              class="btn-primary btn-sm"
              :disabled="embeddingBusy"
              @click="onReindex"
            >
              <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
              重新索引
            </button>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
