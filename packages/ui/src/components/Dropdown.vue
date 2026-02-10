<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface DropdownItem {
  /** Unique key */
  key: string
  /** Display label */
  label: string
  /** UnoCSS icon class, e.g. 'i-carbon-settings' */
  icon?: string
  /** Whether to render a separator line above this item */
  separator?: boolean
  /** Whether this item is currently active/checked */
  active?: boolean
}

const props = withDefaults(defineProps<{
  items: DropdownItem[]
  /** Preferred opening direction */
  placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
  /** Keep menu open after selecting (useful for toggles) */
  persistent?: boolean
  /** How the dropdown is triggered: click or hover */
  trigger?: 'click' | 'hover'
}>(), {
  placement: 'top-end',
  persistent: false,
  trigger: 'click',
})

const emit = defineEmits<{
  select: [key: string]
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const focusedIndex = ref(-1)
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

const placementClasses = computed(() => {
  switch (props.placement) {
    case 'top-start':
      return 'bottom-full left-0 mb-1'
    case 'top-end':
      return 'bottom-full right-0 mb-1'
    case 'bottom-start':
      return 'top-full left-0 mt-1'
    case 'bottom-end':
      return 'top-full right-0 mt-1'
    default:
      return ''
  }
})

function open() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer)
    hoverCloseTimer = null
  }
  if (isOpen.value)
    return
  isOpen.value = true
  focusedIndex.value = -1
  nextTick(() => {
    menuRef.value?.focus()
  })
}

function toggle() {
  if (isOpen.value) {
    close()
  }
  else {
    open()
  }
}

function close() {
  isOpen.value = false
  focusedIndex.value = -1
}

function scheduleClose() {
  hoverCloseTimer = setTimeout(close, 150)
}

function handleTriggerClick() {
  if (props.trigger === 'click')
    toggle()
}

function handleMouseEnter() {
  if (props.trigger === 'hover')
    open()
}

function handleMouseLeave() {
  if (props.trigger === 'hover')
    scheduleClose()
}

function handleSelect(key: string) {
  emit('select', key)
  if (!props.persistent)
    close()
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value)
    return

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % props.items.length
      break
    }
    case 'ArrowUp': {
      e.preventDefault()
      focusedIndex.value = focusedIndex.value <= 0 ? props.items.length - 1 : focusedIndex.value - 1
      break
    }
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const focused = focusedIndex.value >= 0 ? props.items[focusedIndex.value] : undefined
      if (focused)
        handleSelect(focused.key)
      break
    }
    case 'Escape': {
      e.preventDefault()
      close()
      break
    }
  }
}

function onClickOutside(e: MouseEvent) {
  if (!isOpen.value)
    return
  const target = e.target as Node
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target))
    return
  close()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer)
    hoverCloseTimer = null
  }
})
</script>

<template>
  <div
    class="relative inline-flex"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Trigger -->
    <div ref="triggerRef" class="inline-flex" @click="handleTriggerClick">
      <slot name="trigger" />
    </div>

    <!-- Menu -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        ref="menuRef"
        role="menu"
        tabindex="-1"
        class="dropdown-menu absolute z-50 min-w-[140px] w-max rounded-lg border border-border bg-popover text-popover-foreground shadow-md py-0.5"
        :class="placementClasses"
        @keydown="handleKeydown"
      >
        <template v-for="(item, index) in items" :key="item.key">
          <div v-if="item.separator" class="my-0.5 h-px bg-border" />
          <button
            role="menuitem"
            class="w-full flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus:outline-none"
            :class="[
              focusedIndex === index ? 'bg-accent text-accent-foreground' : '',
              item.active ? 'text-accent-foreground' : '',
            ]"
            @click="handleSelect(item.key)"
            @mouseenter="focusedIndex = index"
          >
            <div v-if="item.icon" :class="item.icon" class="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            <span class="flex-1 text-left whitespace-nowrap">{{ item.label }}</span>
            <div
              v-if="item.active !== undefined"
              class="relative h-3.5 w-6 flex-shrink-0 rounded-full transition-colors duration-150"
              :class="item.active ? 'bg-primary' : 'bg-muted-foreground/25'"
            >
              <div
                class="absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-background transition-transform duration-150"
                :class="item.active ? 'translate-x-2.5' : 'translate-x-0'"
              />
            </div>
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
