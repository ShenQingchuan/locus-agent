<script setup lang="ts">
import type { DiffLineAnnotation } from '@pierre/diffs'
import type { AnnotationMetadata } from '@/composables/useReviewAnnotations'
import { useDiffViewer } from '@/composables/useDiffViewer'

const props = defineProps<{
  /** Unified diff / patch string to render */
  patch: string
  /** File path (used in ---/+++ headers if missing) */
  filePath?: string
  /** Display style: split (side-by-side) or unified (stacked) */
  diffStyle?: 'split' | 'unified'
  /** Enable annotation mode with gutter "+" button */
  enableAnnotation?: boolean
  /** Annotations to display on diff lines */
  annotations?: DiffLineAnnotation<AnnotationMetadata>[]
}>()

const emit = defineEmits<{
  /** Fired when user clicks the gutter utility button on a line range */
  annotate: [range: import('@pierre/diffs').SelectedLineRange]
}>()

const { containerRef, fallbackText } = useDiffViewer(props, {
  annotate: range => emit('annotate', range),
})
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
  --diffs-font-family: 'Fira Code', ui-monospace, monospace;
  --diffs-header-font-family: 'Archivo', ui-sans-serif, sans-serif;
  --diffs-font-size: 13px;
  --diffs-line-height: 1.6;
  --diffs-tab-size: 2;
  border-radius: 0.375rem;
  overflow: hidden;
}
</style>
