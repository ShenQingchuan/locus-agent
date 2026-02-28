<script lang="ts">
import mermaid from 'mermaid'

let queue = Promise.resolve()

function enqueuRender(
  code: string,
  dark: boolean,
  isStale: () => boolean,
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    queue = queue.then(async () => {
      if (isStale()) {
        resolve(null)
        return
      }
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      try {
        mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' })
        const { svg } = await mermaid.render(id, code)
        resolve(isStale() ? null : svg)
      }
      catch {
        document.getElementById(id)?.remove()
        resolve(null)
      }
    })
  })
}
</script>

<script setup lang="ts">
import { useDark, useDebounceFn } from '@vueuse/core' // eslint-disable-line import/first
import { ref, watch } from 'vue' // eslint-disable-line import/first

const props = defineProps<{
  node: any
}>()

const svgHtml = ref('')
const error = ref<string | null>(null)
const isDark = useDark()

let generation = 0

async function renderMermaid(code: string, dark: boolean) {
  if (!code.trim())
    return
  const gen = ++generation
  const svg = await enqueuRender(code, dark, () => gen !== generation)
  if (!svg || gen !== generation)
    return
  svgHtml.value = svg
  error.value = null
}

const debouncedRender = useDebounceFn(() => {
  renderMermaid(props.node.code, isDark.value)
}, 600)

watch(() => props.node.code, () => {
  if (props.node.code)
    debouncedRender()
}, { immediate: true })

watch(isDark, () => {
  if (props.node.code && svgHtml.value) {
    renderMermaid(props.node.code, isDark.value)
  }
})

const ZOOM_STEP = 0.2
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3
const zoom = ref(1)

function zoomIn() {
  zoom.value = Math.min(MAX_ZOOM, +(zoom.value + ZOOM_STEP).toFixed(1))
}

function zoomOut() {
  zoom.value = Math.max(MIN_ZOOM, +(zoom.value - ZOOM_STEP).toFixed(1))
}

function zoomReset() {
  zoom.value = 1
}

const copied = ref(false)
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.node.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {}
}

// 代码/预览切换
const showSource = ref(false)
function toggleSource() {
  showSource.value = !showSource.value
}
</script>

<template>
  <div class="mermaid-block relative group my-3 overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground border-b border-border">
      <span class="font-mono">Mermaid</span>
      <div class="flex items-center gap-0.5">
        <button
          class="p-1 rounded hover:bg-muted"
          title="Zoom out"
          :disabled="zoom <= MIN_ZOOM"
          @click="zoomOut"
        >
          <div class="i-carbon-zoom-out h-3.5 w-3.5" />
        </button>
        <button
          class="px-1 py-0.5 rounded hover:bg-muted tabular-nums min-w-8 text-center"
          title="Reset zoom"
          @click="zoomReset"
        >
          {{ Math.round(zoom * 100) }}%
        </button>
        <button
          class="p-1 rounded hover:bg-muted"
          title="Zoom in"
          :disabled="zoom >= MAX_ZOOM"
          @click="zoomIn"
        >
          <div class="i-carbon-zoom-in h-3.5 w-3.5" />
        </button>
        <div class="w-px h-3.5 bg-border mx-1" />
        <button
          class="p-1 rounded hover:bg-muted"
          :class="{ 'bg-muted': showSource }"
          :title="showSource ? 'Show preview' : 'Show source'"
          @click="toggleSource"
        >
          <div :class="showSource ? 'i-carbon-chart-bar' : 'i-carbon-code'" class="h-3.5 w-3.5" />
        </button>
        <button
          class="p-1 rounded hover:bg-muted"
          title="Copy source"
          @click="handleCopy"
        >
          <div v-if="copied" class="i-carbon-checkmark h-3.5 w-3.5 text-green-500" />
          <div v-else class="i-carbon-copy h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- 源代码展示 -->
    <div v-if="showSource" class="p-4">
      <pre class="text-xs overflow-auto p-2 rounded bg-muted/30 font-mono">{{ node.code }}</pre>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error && !svgHtml" class="p-4">
      <p class="text-sm text-red-500 mb-2">
        {{ error }}
      </p>
      <pre class="text-xs overflow-auto p-2 rounded bg-muted/30 font-mono">{{ node.code }}</pre>
    </div>

    <!-- Mermaid 渲染图 -->
    <div v-else-if="svgHtml" class="mermaid-svg-container overflow-auto p-4">
      <div
        class="flex justify-center origin-top-left"
        :style="{ transform: `scale(${zoom})` }"
      >
        <div v-html="svgHtml" />
      </div>
    </div>

    <!-- 加载中 -->
    <div v-else class="flex items-center justify-center p-6">
      <div class="i-svg-spinners:bars-fade h-5 w-5 text-muted-foreground" />
    </div>
  </div>
</template>

<style>
.mermaid-block {
  border-radius: 0.5rem;
  border: 1px solid hsl(var(--border));
}

.mermaid-svg-container svg {
  max-width: 100%;
  height: auto;
}
</style>
