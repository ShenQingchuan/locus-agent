<script setup lang="ts">
import type { DiffLineAnnotation, SelectedLineRange, SelectionSide } from '@pierre/diffs'
import type { AnnotationMetadata } from '@/composables/useReviewAnnotations'
import { FileDiff, parsePatchFiles } from '@pierre/diffs'
import { useDark } from '@vueuse/core'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

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
  annotate: [range: SelectedLineRange]
}>()

const RE_MINUS_FILE_HEADER = /^---\s/m
const RE_PLUS_FILE_HEADER = /^\+\+\+\s/m

const ANNOTATION_HIGHLIGHT_CSS = `
[data-annotation-highlight] {
  &[data-line],
  &[data-line][data-hovered] {
    background-color: light-dark(
      color-mix(in lab, var(--diffs-line-bg, var(--diffs-bg)) 82%, #3b82f6),
      color-mix(in lab, var(--diffs-line-bg, var(--diffs-bg)) 78%, #3b82f6)
    ) !important;
  }
}
[data-annotation-highlight][data-column-number] {
  color: #3b82f6;
  background-color: light-dark(
    color-mix(in lab, var(--diffs-line-bg, var(--diffs-bg)) 78%, #3b82f6),
    color-mix(in lab, var(--diffs-line-bg, var(--diffs-bg)) 72%, #3b82f6)
  ) !important;
}
`

const isDark = useDark()

const containerRef = ref<HTMLElement | null>(null)
/** Fallback text shown when parsePatchFiles fails */
const fallbackText = ref('')
let instance: FileDiff<AnnotationMetadata> | null = null

/**
 * Ensure the patch has proper --- / +++ file headers.
 * LLMs often output only @@ hunks without the file header lines,
 * which causes parsePatchFiles to return an empty files array.
 */
function normalizePatch(raw: string, filePath?: string): string {
  const trimmed = raw.trim()
  if (RE_MINUS_FILE_HEADER.test(trimmed) && RE_PLUS_FILE_HEADER.test(trimmed))
    return trimmed

  const name = filePath || 'file'
  return `--- a/${name}\n+++ b/${name}\n${trimmed}`
}

function createAnnotationElement(annotation: DiffLineAnnotation<AnnotationMetadata>): HTMLElement | undefined {
  if (!annotation.metadata)
    return undefined

  const { lineStart, lineEnd, comment } = annotation.metadata
  const isRange = lineStart !== lineEnd

  const wrapper = document.createElement('div')
  wrapper.style.cssText = `padding:4px 12px;font-size:12px;line-height:1.5;border-left:3px solid #3b82f6;margin:2px 0;background:rgba(59,130,246,0.08);border-radius:0 4px 4px 0;color:inherit;font-family:var(--diffs-header-font-family,sans-serif);display:flex;align-items:baseline;gap:8px;`

  if (isRange) {
    const range = document.createElement('span')
    range.textContent = `L${lineStart}-L${lineEnd}`
    range.style.cssText = 'font-size:11px;color:#3b82f6;font-weight:500;flex-shrink:0;font-family:var(--diffs-font-family,monospace);'
    wrapper.appendChild(range)
  }

  const text = document.createElement('span')
  text.textContent = comment
  text.style.opacity = '0.9'
  wrapper.appendChild(text)

  return wrapper
}

/**
 * Apply native-style line highlights to all multi-line annotation ranges
 * by traversing the Shadow DOM and adding `data-annotation-highlight`.
 */
function applyAnnotationHighlights() {
  if (!instance || !props.annotations?.length)
    return

  const el = containerRef.value
  if (!el)
    return

  const fileContainer = el.querySelector(':scope > *')
  const shadowRoot = fileContainer?.shadowRoot
  if (!shadowRoot)
    return

  const pre = shadowRoot.querySelector('pre')
  if (!pre)
    return

  // Clear previous highlights
  for (const marked of shadowRoot.querySelectorAll('[data-annotation-highlight]'))
    marked.removeAttribute('data-annotation-highlight')

  const isSplit = pre.getAttribute('data-diff-type') === 'split'
  const multiLineAnnotations = props.annotations.filter(
    a => a.metadata && a.metadata.lineStart !== a.metadata.lineEnd,
  )
  if (!multiLineAnnotations.length)
    return

  // Build a set of [startIdx, endIdx, side] ranges to highlight
  const ranges: { start: number, end: number }[] = []
  for (const ann of multiLineAnnotations) {
    const side = ann.side as SelectionSide
    const startIdxPair = instance.getLineIndex(ann.metadata!.lineStart, side)
    const endIdxPair = instance.getLineIndex(ann.metadata!.lineEnd, side)
    if (!startIdxPair || !endIdxPair)
      continue
    ranges.push({
      start: Math.min(startIdxPair[0], startIdxPair[1]),
      end: Math.max(endIdxPair[0], endIdxPair[1]),
    })
  }

  if (!ranges.length)
    return

  for (const codeColumn of pre.children) {
    const [gutter, content] = codeColumn.children
    if (!gutter || !content)
      continue
    const len = content.children.length

    for (let i = 0; i < len; i++) {
      const contentEl = content.children[i]
      const gutterEl = gutter.children[i]
      if (!(contentEl instanceof HTMLElement) || !(gutterEl instanceof HTMLElement))
        continue

      const lineIndexStr = contentEl.getAttribute('data-line-index') ?? ''
      const indexes = lineIndexStr.split(',').map(v => Number.parseInt(v, 10)).filter(v => !Number.isNaN(v))
      const lineIndex = isSplit && indexes.length === 2 ? indexes[1]! : indexes[0]
      if (lineIndex == null)
        continue

      const inRange = ranges.some(r => lineIndex >= r.start && lineIndex <= r.end)
      if (inRange) {
        contentEl.setAttribute('data-annotation-highlight', '')
        gutterEl.setAttribute('data-annotation-highlight', '')
      }
    }
  }
}

async function render() {
  cleanup()
  fallbackText.value = ''

  await nextTick()

  const el = containerRef.value
  if (!el || !props.patch)
    return

  try {
    const normalized = normalizePatch(props.patch, props.filePath)
    const patches = parsePatchFiles(normalized)
    if (!patches.length || !patches[0]!.files.length) {
      fallbackText.value = props.patch
      return
    }

    const annotationOptions = props.enableAnnotation
      ? {
          enableGutterUtility: true as const,
          onGutterUtilityClick(range: SelectedLineRange) {
            emit('annotate', range)
          },
          enableLineSelection: true as const,
          lineHoverHighlight: 'number' as const,
          renderAnnotation: createAnnotationElement,
        }
      : {}

    instance = new FileDiff<AnnotationMetadata>({
      theme: { dark: 'github-dark-default', light: 'min-light' },
      themeType: isDark.value ? 'dark' : 'light',
      diffStyle: props.diffStyle ?? 'unified',
      diffIndicators: 'bars',
      overflow: 'scroll',
      hunkSeparators: 'line-info',
      lineDiffType: 'word-alt',
      unsafeCSS: ANNOTATION_HIGHLIGHT_CSS,
      onPostRender: () => applyAnnotationHighlights(),
      ...annotationOptions,
    })

    instance.render({
      fileDiff: patches[0]!.files[0]!,
      containerWrapper: el,
      lineAnnotations: props.annotations,
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

watch(() => [props.patch, props.diffStyle, props.filePath, props.enableAnnotation, isDark.value], render, { flush: 'post' })
watch(containerRef, (el) => {
  if (el)
    render()
})

watch(() => props.annotations, (annotations) => {
  if (instance && annotations) {
    instance.setLineAnnotations(annotations)
    nextTick(() => applyAnnotationHighlights())
  }
}, { deep: true })

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
  --diffs-font-family: 'Fira Code', ui-monospace, monospace;
  --diffs-header-font-family: 'Archivo', ui-sans-serif, sans-serif;
  --diffs-font-size: 13px;
  --diffs-line-height: 1.6;
  --diffs-tab-size: 2;
  border-radius: 0.375rem;
  overflow: hidden;
}
</style>
