<script setup lang="ts">
import { useIntersectionObserver } from '@vueuse/core'
import { computed, inject, nextTick, ref } from 'vue'
import DiffViewer from '@/components/code/DiffViewer.vue'
import { chatMessageListScrollRootKey } from '@/composables/chatMessageListContext'

const props = defineProps<{
  patch: string
  filePath: string
  expanded: boolean
  /** Outer wrapper: compact ACP row / approval card footer / normal completed block */
  variant: 'compact' | 'embedded-approval' | 'standalone'
}>()

const emit = defineEmits<{
  'update:expanded': [value: boolean]
}>()

const scrollRootRef = inject(chatMessageListScrollRootKey, ref<HTMLElement | null>(null))
const hostRef = ref<HTMLElement | null>(null)
/** Mount @pierre/diffs only after the row intersects the message list scrollport (or viewport fallback). */
const canMountDiff = ref(false)

const { stop: stopIntersectionWatch } = useIntersectionObserver(
  hostRef,
  (entries) => {
    const entry = entries[0]
    if (!entry?.isIntersecting)
      return
    // Defer one frame after intersection so virtualizer layout / scroll position can settle.
    void nextTick(() => {
      requestAnimationFrame(() => {
        canMountDiff.value = true
        stopIntersectionWatch()
      })
    })
  },
  {
    root: scrollRootRef,
    rootMargin: '120px 0px',
    threshold: 0,
  },
)

const wrapperClass = computed(() => {
  switch (props.variant) {
    case 'compact':
      return 'mt-1 rounded-md border border-border overflow-hidden'
    case 'embedded-approval':
      return 'border-t border-border rounded-b-lg overflow-hidden'
    case 'standalone':
      return 'mt-1.5 rounded-md border border-border overflow-hidden'
    default:
      return ''
  }
})

function toggleExpanded() {
  emit('update:expanded', !props.expanded)
}
</script>

<template>
  <div ref="hostRef" :class="wrapperClass">
    <div
      class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/50 transition-colors"
      @click="toggleExpanded"
    >
      <div class="i-carbon-code h-3 w-3 flex-shrink-0 text-muted-foreground" />
      <code class="text-xs font-mono text-muted-foreground truncate">{{ filePath }}</code>
      <div
        class="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down flex-shrink-0"
        :class="[expanded ? 'rotate-180' : '']"
      />
    </div>
    <div
      v-show="expanded"
      class="max-h-[400px] overflow-y-auto border-t border-border"
    >
      <DiffViewer
        v-if="expanded && canMountDiff"
        :patch="patch"
        :file-path="filePath"
      />
      <div
        v-else-if="expanded"
        class="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground/80"
      >
        <div class="i-svg-spinners:90-ring-with-bg h-4 w-4 opacity-70" />
        <span>准备差异视图…</span>
      </div>
    </div>
  </div>
</template>
