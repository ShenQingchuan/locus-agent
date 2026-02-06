<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  content?: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}>(), {
  content: '',
  placement: 'top',
  delay: 300,
})

const triggerRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const position = ref({ top: '0px', left: '0px' })
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const hasContent = computed(() => !!props.content)

function updatePosition() {
  if (!triggerRef.value || !tooltipRef.value)
    return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const tooltipRect = tooltipRef.value.getBoundingClientRect()
  const gap = 6

  let top = 0
  let left = 0

  switch (props.placement) {
    case 'top':
      top = triggerRect.top - tooltipRect.height - gap
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'bottom':
      top = triggerRect.bottom + gap
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2
      break
    case 'left':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.left - tooltipRect.width - gap
      break
    case 'right':
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2
      left = triggerRect.right + gap
      break
  }

  // Clamp to viewport
  const padding = 8
  left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding))
  top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding))

  position.value = { top: `${top}px`, left: `${left}px` }
}

function show() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  if (!hasContent.value)
    return
  showTimer = setTimeout(() => {
    visible.value = true
    requestAnimationFrame(updatePosition)
  }, props.delay)
}

function hide() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  hideTimer = setTimeout(() => {
    visible.value = false
  }, 100)
}

onBeforeUnmount(() => {
  if (showTimer)
    clearTimeout(showTimer)
  if (hideTimer)
    clearTimeout(hideTimer)
})
</script>

<template>
  <div
    ref="triggerRef"
    class="inline-flex"
    @mouseenter="show"
    @mouseleave="hide"
    @focus="show"
    @blur="hide"
  >
    <slot />

    <Teleport to="body">
      <Transition name="tooltip">
        <div
          v-if="visible && hasContent"
          ref="tooltipRef"
          class="tooltip-popup fixed z-[9999] px-2.5 py-1.5 text-xs rounded-md shadow-md pointer-events-none max-w-64 whitespace-nowrap"
          :style="position"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tooltip-popup {
  background-color: hsl(var(--tooltip));
  color: hsl(var(--tooltip-foreground));
}

.tooltip-enter-active,
.tooltip-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
