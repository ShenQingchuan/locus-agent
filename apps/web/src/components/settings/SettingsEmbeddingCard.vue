<script setup lang="ts">
import { useToast } from '@locus-agent/ui'
import { useThrottleFn } from '@vueuse/core'
import { computed, onMounted, ref } from 'vue'

const toast = useToast()

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface EmbeddingState {
  status: 'loading' | 'not_configured' | 'indexing' | 'ready' | 'error'
  error?: string
  indexedCount: number
  vecAvailable: boolean
  embeddingConfigured: boolean
}

const embeddingState = ref<EmbeddingState>({
  status: 'loading',
  indexedCount: 0,
  vecAvailable: true,
  embeddingConfigured: false,
})

const embeddingProgress = ref<{
  indexedCount?: number
  totalCount?: number
  percent?: number
}>({})

const embeddingBusy = ref(false)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const embeddingStatusLabel = computed(() => {
  switch (embeddingState.value.status) {
    case 'loading': return '加载中...'
    case 'not_configured': return '未配置'
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
      embeddingConfigured: status.embeddingConfigured,
    }
  }
  catch {
    embeddingState.value.status = 'not_configured'
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
  catch {
    // Clear frontend state even if API fails
  }
  await loadEmbeddingStatus()
}

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
        使用智谱 embedding-3 实现语义搜索
      </p>
    </div>

    <div class="mt-4 space-y-3">
      <!-- 模型信息 -->
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">模型</label>
        <div class="text-xs font-mono text-foreground/80">
          Zhipu embedding-3 (1024d)
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
                'bg-gray-400': embeddingState.status === 'not_configured',
                'bg-blue-500 animate-pulse': embeddingState.status === 'indexing',
                'bg-green-500': embeddingState.status === 'ready',
                'bg-red-500': embeddingState.status === 'error',
              }"
            />
            <span class="text-xs text-foreground">{{ embeddingStatusLabel }}</span>
          </div>
        </div>

        <!-- API Key 未配置提示 -->
        <div v-if="embeddingState.status === 'not_configured'" class="alert text-xs">
          <div class="i-carbon-information h-4 w-4 mr-1.5 flex-shrink-0 text-muted-foreground" />
          <span>请在左侧 LLM 设置中配置智谱（Zhipu）API Key 以启用语义搜索</span>
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

        <!-- 索引进度 -->
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

          <!-- 错误状态：重新索引按钮 -->
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
      </template>
    </div>
  </section>
</template>
