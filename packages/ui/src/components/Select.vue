<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface SelectOption {
  /** Unique value */
  value: string
  /** Display label */
  label: string
  /** UnoCSS icon class */
  icon?: string
  /** Render a separator line above this option */
  separator?: boolean
  /** Optional group label shown above this option */
  groupLabel?: string
}

const props = withDefaults(defineProps<{
  options: SelectOption[]
  modelValue: string
  /** Placeholder when no value selected */
  placeholder?: string
  /** Preferred opening direction */
  placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
  /** Compact size variant */
  size?: 'sm' | 'md'
  /** Init arrow direction */
  arrowDirection?: 'up' | 'down'
  /** Trigger behavior: hover by default, or click */
  trigger?: 'click' | 'hover'
}>(), {
  placeholder: '请选择…',
  placement: 'bottom-start',
  size: 'sm',
  arrowDirection: 'down',
  trigger: 'hover',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const focusedIndex = ref(-1)
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

const selectedOption = computed(() =>
  props.options.find(o => o.value === props.modelValue),
)

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

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    focusedIndex.value = props.options.findIndex(o => o.value === props.modelValue)
    nextTick(() => {
      menuRef.value?.focus()
    })
  }
}

function open() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer)
    hoverCloseTimer = null
  }
  if (isOpen.value)
    return
  isOpen.value = true
  focusedIndex.value = props.options.findIndex(o => o.value === props.modelValue)
  nextTick(() => {
    menuRef.value?.focus()
  })
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

function handleSelect(value: string) {
  emit('update:modelValue', value)
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (!isOpen.value)
    return

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault()
      focusedIndex.value = (focusedIndex.value + 1) % props.options.length
      break
    }
    case 'ArrowUp': {
      e.preventDefault()
      focusedIndex.value = focusedIndex.value <= 0 ? props.options.length - 1 : focusedIndex.value - 1
      break
    }
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const focused = focusedIndex.value >= 0 ? props.options[focusedIndex.value] : undefined
      if (focused)
        handleSelect(focused.value)
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
  <div class="relative inline-flex" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
    <!-- Trigger -->
    <button
      ref="triggerRef"
      class="inline-flex items-center gap-1 rounded-md border border-transparent text-muted-foreground transition-colors duration-150 hover:text-foreground"
      :class="[
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
        isOpen ? 'text-foreground' : '',
      ]"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="handleTriggerClick"
      @keydown="handleKeydown"
    >
      <div v-if="selectedOption?.icon" :class="selectedOption.icon" class="h-3 w-3 flex-shrink-0 opacity-70" />
      <span class="truncate">{{ selectedOption?.label || placeholder }}</span>
      <div
        class="h-3 w-3 flex-shrink-0 opacity-40 transition-transform duration-150"
        :class="[
          isOpen ? 'rotate-180' : '',
          arrowDirection === 'up' ? 'i-carbon-chevron-up' : 'i-carbon-chevron-down',
        ]"
      />
    </button>

    <!-- Dropdown list -->
    <Transition name="select-dropdown">
      <div
        v-if="isOpen"
        ref="menuRef"
        role="listbox"
        tabindex="-1"
        class="absolute z-50 min-w-[160px] w-max rounded-lg border border-border bg-popover text-popover-foreground shadow-md py-0.5"
        :class="placementClasses"
        @keydown="handleKeydown"
      >
        <template v-for="(option, index) in options" :key="option.value">
          <div v-if="option.separator" class="mx-1 my-1 h-px bg-border" />
          <div v-if="option.groupLabel" class="px-2.5 pb-0.5 pt-1 text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
            {{ option.groupLabel }}
          </div>
          <button
            role="option"
            :aria-selected="option.value === modelValue"
            class="w-full flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus:outline-none"
            :class="[
              focusedIndex === index ? 'bg-accent text-accent-foreground' : '',
              option.value === modelValue ? 'text-accent-foreground' : '',
            ]"
            @click="handleSelect(option.value)"
            @mouseenter="focusedIndex = index"
          >
            <div v-if="option.icon" :class="option.icon" class="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            <span class="flex-1 text-left whitespace-nowrap">{{ option.label }}</span>
            <div
              class="i-carbon-checkmark h-3 w-3 flex-shrink-0 transition-opacity duration-100"
              :class="option.value === modelValue ? 'opacity-100' : 'opacity-0'"
            />
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.select-dropdown-enter-active,
.select-dropdown-leave-active {
  transition: opacity 150ms ease, transform 150ms ease;
}

.select-dropdown-enter-from,
.select-dropdown-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
