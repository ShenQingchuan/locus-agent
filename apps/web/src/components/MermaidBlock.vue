<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { renderMermaid, THEMES } from 'beautiful-mermaid'
import { ref, watch } from 'vue'

const props = defineProps<{
  node: {
    type: string
    language: string
    code: string
    loading?: boolean
  }
}>()

const svgHtml = ref('')
const rendering = ref(false)
const error = ref<string | null>(null)
const isDark = useDark()

// Use watch instead of watchEffect to avoid tracking async internals
watch(
  () => [props.node.code, props.node.loading, isDark.value] as const,
  async ([code, loading, dark]) => {
    if (!code || loading) {
      return
    }

    rendering.value = true
    error.value = null

    try {
      const theme = dark ? THEMES['github-dark'] : THEMES['github-light']
      svgHtml.value = await renderMermaid(code, { ...theme, transparent: true })
    }
    catch (e: any) {
      error.value = e.message || 'Mermaid render failed'
    }
    finally {
      rendering.value = false
    }
  },
  { immediate: true },
)

const copied = ref(false)
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.node.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {}
}
</script>

<template>
  <div class="mermaid-block relative group my-3 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground">
      <span class="font-mono">Mermaid</span>
      <button
        class="transition-opacity duration-150 p-1 rounded hover:bg-muted"
        title="Copy source"
        @click="handleCopy"
      >
        <div v-if="copied" class="i-carbon-checkmark h-3.5 w-3.5 text-green-500" />
        <div v-else class="i-carbon-copy h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Loading -->
    <div v-if="node.loading || rendering" class="mermaid-block-body flex items-center justify-center p-6">
      <div class="i-carbon-circle-dash h-5 w-5 animate-spin text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">Rendering diagram...</span>
    </div>

    <!-- Error fallback -->
    <div v-else-if="error" class="mermaid-block-body p-4">
      <p class="text-sm text-red-500 mb-2">
        {{ error }}
      </p>
      <pre class="text-xs overflow-auto p-2 rounded bg-muted/30 font-mono">{{ node.code }}</pre>
    </div>

    <!-- SVG output -->
    <div v-else class="mermaid-block-body mermaid-svg-container p-4 flex justify-center" v-html="svgHtml" />
  </div>
</template>

<style>
.mermaid-block {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border, hsl(0 0% 89.8%));
}

html.dark .mermaid-block {
  border-color: var(--color-border, hsl(0 0% 14.9%));
}

.mermaid-svg-container svg {
  max-width: 100%;
  height: auto;
}
</style>
