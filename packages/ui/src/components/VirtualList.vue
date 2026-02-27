<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  /** Total number of items */
  count: number
  /** Estimated item height in px */
  estimateSize?: number
  /** Overscan count (extra items rendered above/below viewport) */
  overscan?: number
  /** Additional class for the scroll container */
  containerClass?: string
}>(), {
  estimateSize: 32,
  overscan: 5,
  containerClass: '',
})

defineSlots<{
  /** Render each virtual item. Receives index and virtualRow for measurement. */
  default: (props: { index: number, size: number, start: number }) => any
}>()

const scrollContainerRef = ref<HTMLDivElement | null>(null)

const virtualizer = useVirtualizer(computed(() => ({
  count: props.count,
  getScrollElement: () => scrollContainerRef.value,
  estimateSize: () => props.estimateSize,
  overscan: props.overscan,
})))

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

defineExpose({
  /** Access the underlying virtualizer instance */
  virtualizer,
  /** Scroll to a specific index */
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' | 'auto' }) => {
    virtualizer.value.scrollToIndex(index, options)
  },
})
</script>

<template>
  <div
    ref="scrollContainerRef"
    class="virtual-list-scroll-container overflow-auto"
    :class="containerClass"
  >
    <div
      class="virtual-list-content relative w-full"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="item in virtualItems"
        :key="String(item.key)"
        class="virtual-list-item absolute left-0 w-full"
        :style="{ height: `${item.size}px`, transform: `translateY(${item.start}px)` }"
        :data-index="item.index"
      >
        <slot :index="item.index" :size="item.size" :start="item.start" />
      </div>
    </div>
  </div>
</template>
