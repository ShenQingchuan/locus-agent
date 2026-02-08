<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface DropdownItem {
  /** Unique key */
  key: string
  /** Display label */
  label: string
  /** UnoCSS icon class, e.g. 'i-carbon-settings' */
  icon?: string
  /** Whether to render a separator line above this item */
  separator?: boolean
}

const props = withDefaults(defineProps<{
  items: DropdownItem[]
  /** Preferred opening direction */
  placement?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
}>(), {
  placement: 'top-end',
})

const emit = defineEmits<{
  select: [key: string]
}>()

const isOpen = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

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
}

function close() {
  isOpen.value = false
}

function handleSelect(key: string) {
  emit('select', key)
  close()
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
})
</script>

<template>
  <div class="relative inline-flex">
    <!-- Trigger -->
    <div ref="triggerRef" class="inline-flex" @click="toggle">
      <slot name="trigger" />
    </div>

    <!-- Menu -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="dropdown-menu absolute z-50 min-w-[160px] rounded-lg border border-border bg-popover text-popover-foreground shadow-md py-1"
        :class="placementClasses"
      >
        <template v-for="item in items" :key="item.key">
          <div v-if="item.separator" class="my-1 h-px bg-border" />
          <button
            class="w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-100 hover:bg-accent hover:text-accent-foreground"
            @click="handleSelect(item.key)"
          >
            <div v-if="item.icon" :class="item.icon" class="h-4 w-4 flex-shrink-0" />
            <span>{{ item.label }}</span>
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
