<script setup lang="ts">
import { useToast } from '@locus-agent/ui'
import { useThrottleFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

const toast = useToast()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface EmbeddingState {
  status: 'loading' | 'not_downloaded' | 'downloading' | 'indexing' | 'ready' | 'error'
  error?: string
  indexedCount: number
  vecAvailable: boolean
  embeddingModelCached: boolean
  embeddingModelLoaded: boolean
}

const embeddingState = ref<EmbeddingState>({
  status: 'loading',
  indexedCount: 0,
  vecAvailable: true,
  embeddingModelCached: false,
  embeddingModelLoaded: false,
})

interface FileProgressItem {
  name: string
  loaded: number
  total: number
  percent: number
}

const embeddingProgress = ref<{
  file?: string
  loaded?: number
  total?: number
  percent?: number
  files?: FileProgressItem[]
  indexedCount?: number
  totalCount?: number
}>({})

const embeddingBusy = ref(false)
let embeddingStreamClose: (() => void) | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 从路径中提取文件名（取最后一段） */
function shortFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

const embeddingStatusLabel = computed(() => {
  switch (embeddingState.value.status) {
    case 'loading': return '加载中...'
    case 'not_downloaded': return '未下载'
    case 'downloading': return '下载中...'
    case 'indexing': return '索引中...'
    case 'ready': return '已就绪'
    case 'error': return '错误'
    default: return '未知'
  }
})

// ---------------------------------------------------------------------------
// API actions
// ---------------------------------------------------------------------------

async function loadEmbeddingStatus() {
  try {
    const { fetchEmbeddingStatus } = await import('@/api/embedding')
    const status = await fetchEmbeddingStatus()
    embeddingState.value = {
      status: status.status,
      error: status.error,
      indexedCount: status.indexedCount,
      vecAvailable: status.vecAvailable,
      embeddingModelCached: status.embeddingModelCached,
      embeddingModelLoaded: status.embeddingModelLoaded,
    }
  }
  catch {
    embeddingState.value.status = 'not_downloaded'
  }
}

const onDownloadModel = useThrottleFn(async () => {
  embeddingBusy.value = true
  embeddingProgress.value = {}
  embeddingState.value.status = 'downloading'

  const { startModelDownload } = await import('@/api/embedding')
  const stream = startModelDownload(
    (data) => {
      embeddingProgress.value = {
        file: data.file,
        loaded: data.loaded,
        total: data.total,
        percent: data.percent,
        files: data.files,
      }
    },
    () => {
      embeddingState.value.status = 'ready'
      embeddingBusy.value = false
      embeddingStreamClose = null
      toast.success('模型下载完成')
      loadEmbeddingStatus()
    },
    (msg) => {
      embeddingState.value.status = 'error'
      embeddingState.value.error = msg
      embeddingBusy.value = false
      embeddingStreamClose = null
      toast.error(`下载失败: ${msg}`)
    },
  )
  embeddingStreamClose = stream.close
}, 2000)

async function onCancelDownload() {
  if (embeddingStreamClose) {
    embeddingStreamClose()
    embeddingStreamClose = null
  }
  const { cancelModelDownload } = await import('@/api/embedding')
  await cancelModelDownload().catch(() => {})
  embeddingState.value.status = 'not_downloaded'
  embeddingBusy.value = false
  embeddingProgress.value = {}
  toast.success('已取消下载')
}

const onReindex = useThrottleFn(async () => {
  embeddingBusy.value = true
  embeddingProgress.value = {}
  embeddingState.value.status = 'indexing'

  const { startReindex } = await import('@/api/embedding')
  const stream = startReindex(
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
  embeddingStreamClose = stream.close
}, 2000)

async function onDismissError() {
  try {
    const { clearEmbeddingError } = await import('@/api/embedding')
    await clearEmbeddingError()
  }
  catch {
    // 即使 API 失败，也在前端清除错误态让用户继续操作
  }
  await loadEmbeddingStatus()
}

const onDeleteModel = useThrottleFn(async () => {
  embeddingBusy.value = true
  try {
    const { deleteEmbeddingModel } = await import('@/api/embedding')
    await deleteEmbeddingModel()
    toast.success('模型已删除')
  }
  catch (err) {
    toast.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`)
  }
  finally {
    embeddingBusy.value = false
    // 从服务器同步最新状态，确保 UI 与后端一致
    await loadEmbeddingStatus()
  }
}, 2000)

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  loadEmbeddingStatus()
})
</script>

<template>
  <section class="card p-4">
    <div>
      <h2 class="text-sm font-semibold text-foreground">
        Embedding
      </h2>
      <p class="text-xs text-muted-foreground mt-0.5">
        向量化能实现更好的语义搜索，需要下载专用模型
      </p>
    </div>

    <div class="mt-4 space-y-3">
      <!-- 模型信息 -->
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">模型</label>
        <div class="text-xs font-mono text-foreground/80">
          multilingual-e5-small (INT8, ~90MB)
        </div>
      </div>

      <!-- sqlite-vec 不可用提示 -->
      <div v-if="!embeddingState.vecAvailable && embeddingState.status !== 'loading'" class="alert alert-destructive text-xs">
        <div class="i-carbon-warning-alt h-4 w-4 mr-1.5 flex-shrink-0" />
        <span>sqlite-vec 扩展不可用，语义搜索功能已禁用</span>
      </div>

      <!-- 加载中 -->
      <div v-else-if="embeddingState.status === 'loading'" class="flex-col-center py-4 text-muted-foreground">
        <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
        <span class="text-xs mt-1.5 opacity-70">加载中...</span>
      </div>

      <template v-else>
        <!-- 状态指示 -->
        <div class="grid gap-1.5">
          <label class="text-xs text-muted-foreground">状态</label>
          <div class="flex items-center gap-2">
            <span
              class="inline-block h-2 w-2 rounded-full"
              :class="{
                'bg-gray-400': embeddingState.status === 'not_downloaded',
                'bg-yellow-500 animate-pulse': embeddingState.status === 'downloading',
                'bg-blue-500 animate-pulse': embeddingState.status === 'indexing',
                'bg-green-500': embeddingState.status === 'ready',
                'bg-red-500': embeddingState.status === 'error',
              }"
            />
            <span class="text-xs text-foreground">{{ embeddingStatusLabel }}</span>
          </div>
        </div>

        <!-- 错误信息 -->
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

        <!-- 下载进度：文件表格 + 总进度 -->
        <div v-if="embeddingState.status === 'downloading'" class="space-y-2">
          <!-- 文件列表表格 -->
          <div v-if="embeddingProgress.files?.length" class="rounded-lg border border-border overflow-hidden">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-muted/40 text-muted-foreground">
                  <th class="text-left font-medium px-2.5 py-1.5">
                    文件
                  </th>
                  <th class="text-right font-medium px-2.5 py-1.5 w-20">
                    大小
                  </th>
                  <th class="text-right font-medium px-2.5 py-1.5 w-16">
                    进度
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="fp in embeddingProgress.files"
                  :key="fp.name"
                  class="border-t border-border/50"
                >
                  <td class="px-2.5 py-1.5">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <div
                        class="h-1.5 w-1.5 rounded-full flex-shrink-0"
                        :class="fp.percent >= 100 ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'"
                      />
                      <span class="font-mono truncate text-foreground/80" :title="fp.name">{{ shortFileName(fp.name) }}</span>
                    </div>
                  </td>
                  <td class="px-2.5 py-1.5 text-right text-muted-foreground tabular-nums">
                    {{ formatBytes(fp.total) }}
                  </td>
                  <td class="px-2.5 py-1.5 text-right tabular-nums" :class="fp.percent >= 100 ? 'text-green-500' : 'text-foreground'">
                    {{ fp.percent }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 总进度条（等文件列表出现后才展示，避免闪烁） -->
          <div v-if="embeddingProgress.files?.length && embeddingProgress.percent != null" class="space-y-1">
            <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                class="h-full rounded-full bg-primary transition-all duration-300"
                :style="{ width: `${embeddingProgress.percent}%` }"
              />
            </div>
            <div class="flex justify-between text-[10px] text-muted-foreground">
              <span>总进度{{ embeddingProgress.total ? ` · ${formatBytes(embeddingProgress.loaded || 0)} / ${formatBytes(embeddingProgress.total)}` : '' }}</span>
              <span>{{ embeddingProgress.percent }}%</span>
            </div>
          </div>

          <!-- 尚无文件进度数据时的占位 -->
          <div v-if="!embeddingProgress.files?.length" class="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <div class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin" />
            <span>正在连接...</span>
          </div>
        </div>

        <!-- 索引进度：圆环 + 文字 -->
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

        <!-- 已就绪时的索引信息 -->
        <div v-if="embeddingState.status === 'ready'" class="text-xs text-muted-foreground">
          已索引 {{ embeddingState.indexedCount }} 条笔记
        </div>

        <!-- 操作按钮 -->
        <div class="flex gap-2 pt-1">
          <!-- 未下载：下载按钮 -->
          <button
            v-if="embeddingState.status === 'not_downloaded'"
            class="btn-primary btn-sm"
            :disabled="embeddingBusy"
            @click="onDownloadModel"
          >
            <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
            下载模型
          </button>

          <!-- 错误状态：根据模型是否已下载显示不同按钮 -->
          <button
            v-if="embeddingState.status === 'error' && !embeddingState.embeddingModelCached"
            class="btn-primary btn-sm"
            :disabled="embeddingBusy"
            @click="onDownloadModel"
          >
            <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
            重新下载
          </button>
          <button
            v-if="embeddingState.status === 'error' && embeddingState.embeddingModelCached"
            class="btn-primary btn-sm"
            :disabled="embeddingBusy"
            @click="onReindex"
          >
            <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
            重新索引
          </button>

          <!-- 下载中：取消按钮 -->
          <button
            v-if="embeddingState.status === 'downloading'"
            class="btn-outline btn-sm"
            @click="onCancelDownload"
          >
            取消
          </button>

          <!-- 已就绪：重新索引 -->
          <button
            v-if="embeddingState.status === 'ready'"
            class="btn-outline btn-sm"
            :disabled="embeddingBusy"
            @click="onReindex"
          >
            <div v-if="embeddingBusy" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin mr-1" />
            重新索引
          </button>

          <!-- 已就绪或错误（模型已下载）：删除模型 -->
          <button
            v-if="embeddingState.status === 'ready' || (embeddingState.status === 'error' && embeddingState.embeddingModelCached)"
            class="btn-ghost btn-sm text-destructive hover:text-destructive"
            :disabled="embeddingBusy"
            @click="onDeleteModel"
          >
            删除模型
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
