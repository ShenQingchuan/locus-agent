<script setup lang="ts">
import { FileDiff, parsePatchFiles } from '@pierre/diffs'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  /** Unified diff / patch string to render */
  patch: string
  /** File path (used in ---/+++ headers if missing) */
  filePath?: string
  /** Display style: split (side-by-side) or unified (stacked) */
  diffStyle?: 'split' | 'unified'
}>()

const containerRef = ref<HTMLElement | null>(null)
/** Fallback text shown when parsePatchFiles fails */
const fallbackText = ref('')
let instance: FileDiff | null = null

/**
 * Ensure the patch has proper --- / +++ file headers.
 * LLMs often output only @@ hunks without the file header lines,
 * which causes parsePatchFiles to return an empty files array.
 */
function normalizePatch(raw: string, filePath?: string): string {
  const trimmed = raw.trim()
  // Already has file headers → use as-is
  if (/^---\s/m.test(trimmed) && /^\+\+\+\s/m.test(trimmed))
    return trimmed

  // Prepend synthetic --- / +++ headers
  const name = filePath || 'file'
  return `--- a/${name}\n+++ b/${name}\n${trimmed}`
}

async function render() {
  cleanup()
  fallbackText.value = ''

  // Wait for DOM to be ready (important when inside Teleport + Transition)
  await nextTick()

  const el = containerRef.value
  if (!el || !props.patch)
    return

  try {
    const normalized = normalizePatch(props.patch, props.filePath)
    const patches = parsePatchFiles(normalized)
    if (!patches.length || !patches[0]!.files.length) {
      // parsePatchFiles couldn't parse it — show raw text as fallback
      fallbackText.value = props.patch
      return
    }

    instance = new FileDiff({
      theme: { dark: 'github-dark-default', light: 'min-light' },
      themeType: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      diffStyle: props.diffStyle ?? 'unified',
      diffIndicators: 'bars',
      overflow: 'scroll',
      hunkSeparators: 'line-info',
      lineDiffType: 'word-alt',
    })

    instance.render({
      fileDiff: patches[0]!.files[0]!,
      containerWrapper: el,
    })
  }
  catch (err) {
    console.warn('[DiffViewer] Failed to render patch:', err)
    fallbackText.value = props.patch
  }
}

function cleanup() {
  if (instance) {
    instance.cleanUp()
    instance = null
  }
}

watch(() => [props.patch, props.diffStyle, props.filePath], render, { flush: 'post' })
watch(containerRef, (el) => {
  if (el)
    render()
})

onBeforeUnmount(cleanup)
</script>

<template>
  <!-- @pierre/diffs renders into this container via Shadow DOM -->
  <div v-show="!fallbackText" ref="containerRef" class="diff-viewer-container" />

  <!-- Fallback: raw patch text when parsing fails -->
  <pre
    v-if="fallbackText"
    class="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all overflow-y-auto max-h-80 text-foreground"
  >{{ fallbackText }}</pre>
</template>

<style>
.diff-viewer-container {
  border-radius: 0.375rem;
  overflow: hidden;
  font-size: 0.8125rem;
  line-height: 1.6;
}
</style>
