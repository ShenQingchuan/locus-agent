<script setup lang="ts">
import { onKeyStroke, useMagicKeys } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

export interface CommandItem {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Optional description shown below label */
  description?: string
  /** UnoCSS icon class (e.g. 'i-carbon-search') */
  icon?: string
  /** Group this item belongs to */
  group?: string
  /** Arbitrary extra data */
  data?: unknown
}

export interface CommandGroup {
  /** Group key (matches CommandItem.group) */
  key: string
  /** Display label for the group header */
  label: string
}

const props = withDefaults(defineProps<{
  /** Whether the palette is open */
  modelValue: boolean
  /** Available items to search/display */
  items: CommandItem[]
  /** Group definitions (ordering + labels) */
  groups?: CommandGroup[]
  /** Placeholder text for the search input */
  placeholder?: string
  /** Whether to close on item select (default true) */
  closeOnSelect?: boolean
}>(), {
  groups: () => [],
  placeholder: '搜索...',
  closeOnSelect: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** Emitted when an item is selected */
  'select': [item: CommandItem]
  /** Emitted when the search query changes (for async filtering) */
  'search': [query: string]
}>()

defineSlots<{
  /** Custom render for each item */
  'item': (props: { item: CommandItem, active: boolean }) => any
  /** Custom render for group headers */
  'group-header': (props: { group: CommandGroup }) => any
  /** Empty state when no results */
  'empty': (props: { query: string }) => any
  /** Footer area below the results */
  'footer': () => any
}>()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// Filter items by query
const filteredItems = computed(() => {
  const q = query.value.toLowerCase().trim()
  if (!q)
    return props.items
  return props.items.filter(item =>
    item.label.toLowerCase().includes(q)
    || item.description?.toLowerCase().includes(q),
  )
})

// Group filtered items
const groupedItems = computed(() => {
  if (props.groups.length === 0) {
    // No groups — return flat list
    return [{ group: null as CommandGroup | null, items: filteredItems.value }]
  }

  const groupMap = new Map<string, CommandItem[]>()
  const ungrouped: CommandItem[] = []

  for (const item of filteredItems.value) {
    if (item.group) {
      const list = groupMap.get(item.group) ?? []
      list.push(item)
      groupMap.set(item.group, list)
    }
    else {
      ungrouped.push(item)
    }
  }

  const result: { group: CommandGroup | null, items: CommandItem[] }[] = []

  for (const group of props.groups) {
    const items = groupMap.get(group.key)
    if (items?.length) {
      result.push({ group, items })
    }
  }

  if (ungrouped.length) {
    result.push({ group: null, items: ungrouped })
  }

  return result
})

// Flat list of items for keyboard navigation indexing
const flatItems = computed(() => groupedItems.value.flatMap(g => g.items))

function close() {
  emit('update:modelValue', false)
  query.value = ''
  activeIndex.value = 0
}

function selectItem(item: CommandItem) {
  emit('select', item)
  if (props.closeOnSelect) {
    close()
  }
}

function selectActive() {
  const item = flatItems.value[activeIndex.value]
  if (item) {
    selectItem(item)
  }
}

// Keyboard navigation
onKeyStroke('ArrowDown', (e) => {
  if (!props.modelValue)
    return
  e.preventDefault()
  activeIndex.value = Math.min(activeIndex.value + 1, flatItems.value.length - 1)
}, { target: document })

onKeyStroke('ArrowUp', (e) => {
  if (!props.modelValue)
    return
  e.preventDefault()
  activeIndex.value = Math.max(activeIndex.value - 1, 0)
}, { target: document })

onKeyStroke('Enter', (e) => {
  if (!props.modelValue)
    return
  e.preventDefault()
  selectActive()
}, { target: document })

onKeyStroke('Escape', () => {
  if (!props.modelValue)
    return
  close()
}, { target: document })

// Global Cmd+K / Ctrl+K shortcut
const { meta_k, ctrl_k } = useMagicKeys()
watch([meta_k, ctrl_k], ([mk, ck]) => {
  if (mk || ck) {
    emit('update:modelValue', true)
  }
})

// Focus input when opened
watch(() => props.modelValue, async (open) => {
  if (open) {
    activeIndex.value = 0
    query.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
})

// Reset active index when results change
watch(flatItems, () => {
  activeIndex.value = 0
})

// Emit search event for async filtering
watch(query, (q) => {
  emit('search', q)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cmd-palette">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-100 flex items-start justify-center pt-[15vh]"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="close" />

        <!-- Palette -->
        <div class="cmd-palette relative w-full max-w-lg mx-4 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden">
          <!-- Search input -->
          <div class="flex items-center gap-2 border-b border-border px-3">
            <div class="i-carbon-search h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              :placeholder="placeholder"
              class="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              @keydown.stop
            >
          </div>

          <!-- Results -->
          <div class="max-h-72 overflow-y-auto p-1">
            <template v-if="flatItems.length === 0">
              <slot name="empty" :query="query">
                <div class="py-8 text-center text-sm text-muted-foreground">
                  无匹配结果
                </div>
              </slot>
            </template>
            <template v-else>
              <template v-for="section in groupedItems" :key="section.group?.key ?? '__ungrouped'">
                <!-- Group header -->
                <div v-if="section.group" class="px-2 py-1.5 text-xs font-medium text-muted-foreground select-none">
                  <slot name="group-header" :group="section.group">
                    {{ section.group.label }}
                  </slot>
                </div>
                <!-- Items -->
                <div
                  v-for="item in section.items"
                  :key="item.id"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer select-none"
                  :class="flatItems[activeIndex]?.id === item.id ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
                  @click="selectItem(item)"
                  @mouseenter="activeIndex = flatItems.indexOf(item)"
                >
                  <slot name="item" :item="item" :active="flatItems[activeIndex]?.id === item.id">
                    <div v-if="item.icon" :class="item.icon" class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div class="flex-1 min-w-0">
                      <div class="truncate">
                        {{ item.label }}
                      </div>
                      <div v-if="item.description" class="truncate text-xs text-muted-foreground">
                        {{ item.description }}
                      </div>
                    </div>
                  </slot>
                </div>
              </template>
            </template>
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="border-t border-border px-3 py-2">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmd-palette-enter-active,
.cmd-palette-leave-active {
  transition: opacity 0.15s ease;
}

.cmd-palette-enter-active .cmd-palette,
.cmd-palette-leave-active .cmd-palette {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.cmd-palette-enter-from,
.cmd-palette-leave-to {
  opacity: 0;
}

.cmd-palette-enter-from .cmd-palette {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}

.cmd-palette-leave-to .cmd-palette {
  transform: scale(0.96) translateY(-8px);
  opacity: 0;
}
</style>
