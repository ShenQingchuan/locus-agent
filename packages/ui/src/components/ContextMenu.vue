<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  separator?: boolean
  disabled?: boolean
  danger?: boolean
}

defineProps<{
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const isOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const focusedIndex = ref(-1)
const position = ref({ x: 0, y: 0 })

function openAt(x: number, y: number) {
  position.value = { x, y }
  isOpen.value = true
  focusedIndex.value = -1
  nextTick(() => {
    clampToViewport()
    menuRef.value?.focus()
  })
}

function close() {
  isOpen.value = false
  focusedIndex.value = -1
}

function clampToViewport() {
  const el = menuRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (rect.right > vw)
    position.value.x = Math.max(0, vw - rect.width - 4)
  if (rect.bottom > vh)
    position.value.y = Math.max(0, vh - rect.height - 4)
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  openAt(e.clientX, e.clientY)
}

function handleSelect(key: string, item: ContextMenuItem) {
  if (item.disabled) return
  emit('select', key)
  close()
}

function moveFocus(step: 1 | -1, items: ContextMenuItem[]) {
  if (items.length === 0) return
  let nextIndex = focusedIndex.value
  for (let i = 0; i < items.length; i++) {
    nextIndex = (nextIndex + step + items.length) % items.length
    if (!items[nextIndex]?.disabled) {
      focusedIndex.value = nextIndex
      return
    }
  }
}

function handleKeydown(e: KeyboardEvent, items: ContextMenuItem[]) {
  if (!isOpen.value) return
  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault()
      moveFocus(1, items)
      break
    }
    case 'ArrowUp': {
      e.preventDefault()
      moveFocus(-1, items)
      break
    }
    case 'Enter':
    case ' ': {
      e.preventDefault()
      const focused = focusedIndex.value >= 0 ? items[focusedIndex.value] : undefined
      if (focused) handleSelect(focused.key, focused)
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
  if (!isOpen.value) return
  const target = e.target as Node
  if (menuRef.value?.contains(target)) return
  close()
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside, true)
})

defineExpose({ openAt, close })
</script>

<template>
  <div ref="triggerRef" class="contents" @contextmenu="handleContextMenu">
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="isOpen"
        ref="menuRef"
        role="menu"
        tabindex="-1"
        class="fixed z-[999] min-w-[160px] w-max rounded-lg border border-border bg-popover text-popover-foreground shadow-lg py-0.5"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        @keydown="handleKeydown($event, items)"
      >
        <template v-for="(item, index) in items" :key="item.key">
          <div v-if="item.separator" class="my-0.5 h-px bg-border" />
          <button
            role="menuitem"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors duration-100 focus:outline-none"
            :class="[
              focusedIndex === index ? 'bg-accent text-accent-foreground' : '',
              item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent hover:text-accent-foreground',
              item.danger && !item.disabled ? 'text-destructive hover:text-destructive' : '',
            ]"
            :disabled="item.disabled"
            @click="handleSelect(item.key, item)"
            @mouseenter="!item.disabled && (focusedIndex = index)"
          >
            <div v-if="item.icon" :class="item.icon" class="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            <span class="flex-1 text-left whitespace-nowrap">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.context-menu-enter-active,
.context-menu-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
