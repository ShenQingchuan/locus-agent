<script setup lang="ts">
import type { PanZoom } from 'panzoom'
import { useDark, useDebounceFn } from '@vueuse/core'
import createPanZoom from 'panzoom'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

// 动态加载 mermaid，避免 ~3MB 进入主 chunk
const mermaidPromise = import('mermaid').then(m => m.default)

const props = defineProps<{
  node: any
}>()

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
        const mermaid = await mermaidPromise
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

const svgHtml = ref('')
const error = ref<string | null>(null)
const isDark = useDark()

const containerRef = ref<HTMLElement | null>(null)
const svgWrapperRef = ref<HTMLElement | null>(null)

let panzoomInstance: PanZoom | null = null
let baseScale = 1

const ZOOM_STEP = 0.2
const MIN_ZOOM_RATIO = 0.2
const MAX_ZOOM_RATIO = 3
const zoomRatio = ref(1)

function disposePanzoom() {
  if (panzoomInstance) {
    panzoomInstance.dispose()
    panzoomInstance = null
  }
}

function fitAndInitPanzoom() {
  const container = containerRef.value
  const wrapper = svgWrapperRef.value
  if (!container || !wrapper)
    return

  const svgEl = wrapper.querySelector('svg')
  if (!svgEl)
    return

  disposePanzoom()

  // Clear stale transform so measurements are accurate
  wrapper.style.transform = ''

  // Remove mermaid's inline dimensions so we can measure the intrinsic size
  svgEl.removeAttribute('width')
  svgEl.style.maxWidth = 'none'
  svgEl.style.height = 'auto'
  container.style.height = 'auto'

  const svgRect = svgEl.getBoundingClientRect()
  const containerW = container.getBoundingClientRect().width

  const svgW = svgRect.width
  const svgH = svgRect.height

  if (svgW === 0 || svgH === 0)
    return

  const FIT_RATIO = 0.7
  const PADDING = 32
  const MIN_HEIGHT = 200
  const MAX_HEIGHT = 500

  // Width-fit scale at 70%
  const widthFitScale = (containerW / svgW) * FIT_RATIO
  const neededH = svgH * widthFitScale + PADDING * 2

  const containerH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, neededH))
  container.style.height = `${containerH}px`

  // Fit within both dimensions: width at 70%, height within padding
  baseScale = Math.min(
    (containerW / svgW) * FIT_RATIO,
    (containerH - PADDING * 2) / svgH,
  )

  const offsetX = (containerW - svgW * baseScale) / 2
  const offsetY = (containerH - svgH * baseScale) / 2

  wrapper.style.transformOrigin = '0 0'

  panzoomInstance = createPanZoom(wrapper, {
    maxZoom: MAX_ZOOM_RATIO * baseScale,
    minZoom: MIN_ZOOM_RATIO * baseScale,
    smoothScroll: false,
    zoomDoubleClickSpeed: 1,
  })

  panzoomInstance.zoomAbs(0, 0, baseScale)
  panzoomInstance.moveTo(offsetX, offsetY)

  zoomRatio.value = 1

  panzoomInstance.on('zoom', () => {
    if (!panzoomInstance)
      return
    const { scale } = panzoomInstance.getTransform()
    zoomRatio.value = Math.round((scale / baseScale) * 100) / 100
  })
}

function zoomIn() {
  if (!panzoomInstance || !containerRef.value)
    return
  const rect = containerRef.value.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const target = Math.min(MAX_ZOOM_RATIO, +(zoomRatio.value + ZOOM_STEP).toFixed(1))
  panzoomInstance.smoothZoomAbs(cx, cy, target * baseScale)
}

function zoomOut() {
  if (!panzoomInstance || !containerRef.value)
    return
  const rect = containerRef.value.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const target = Math.max(MIN_ZOOM_RATIO, +(zoomRatio.value - ZOOM_STEP).toFixed(1))
  panzoomInstance.smoothZoomAbs(cx, cy, target * baseScale)
}

function zoomReset() {
  fitAndInitPanzoom()
}

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

  await nextTick()
  fitAndInitPanzoom()
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

const copied = ref(false)
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.node.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {}
}

const showSource = ref(false)
function toggleSource() {
  showSource.value = !showSource.value
}

watch(showSource, async (val) => {
  if (!val && svgHtml.value) {
    await nextTick()
    fitAndInitPanzoom()
  }
})

onBeforeUnmount(() => {
  disposePanzoom()
})
</script>

<template>
  <div class="mermaid-block relative group my-3 overflow-hidden">
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground border-b border-border">
      <span class="font-mono">Mermaid</span>
      <div class="flex items-center gap-0.5">
        <button
          class="p-1 rounded hover:bg-muted"
          title="Zoom out"
          :disabled="zoomRatio <= MIN_ZOOM_RATIO"
          @click="zoomOut"
        >
          <div class="i-carbon-zoom-out h-3.5 w-3.5" />
        </button>
        <button
          class="px-1 py-0.5 rounded hover:bg-muted tabular-nums min-w-8 text-center"
          title="Reset zoom"
          @click="zoomReset"
        >
          {{ Math.round(zoomRatio * 100) }}%
        </button>
        <button
          class="p-1 rounded hover:bg-muted"
          title="Zoom in"
          :disabled="zoomRatio >= MAX_ZOOM_RATIO"
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
          <div :class="showSource ? 'i-icon-park-twotone:tree-diagram' : 'i-carbon-code'" class="h-3.5 w-3.5" />
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
      <pre class="text-dark dark:text-light text-xs overflow-auto p-2 rounded bg-muted/30 font-mono">{{ node.code }}</pre>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error && !svgHtml" class="p-4">
      <p class="text-sm text-red-500 mb-2">
        {{ error }}
      </p>
      <pre class="text-dark dark:text-light text-xs overflow-auto p-2 rounded bg-muted/30 font-mono">{{ node.code }}</pre>
    </div>

    <!-- Mermaid 渲染图 -->
    <div
      v-else-if="svgHtml"
      ref="containerRef"
      class="mermaid-svg-container relative overflow-hidden"
    >
      <div ref="svgWrapperRef" class="flex items-center justify-center" v-html="svgHtml" />
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

.mermaid-svg-container {
  min-height: 200px;
  cursor: grab;
}

.mermaid-svg-container:active {
  cursor: grabbing;
}
</style>
