<script setup lang="ts">
import type { ListItemAction, ListItemSelectMode } from './ListItem.vue'
import { computed } from 'vue'
import ListItem from './ListItem.vue'

const props = withDefaults(defineProps<{
  /** Array of items to display */
  items: any[]
  /** Key property for each item (default: 'id') */
  itemKey?: string
  /** Selected item key(s) - supports single or multiple selection */
  modelValue?: string | string[]
  /** Enable multi-selection mode */
  multiSelect?: boolean
  /** Selection mode: 'checkbox' shows checkbox, 'highlight' uses background color */
  selectMode?: ListItemSelectMode
  /** Actions available for each item */
  itemActions?: ListItemAction[]
  /** Loading state */
  loading?: boolean
  /** Disable interaction */
  disabled?: boolean
  /** Additional classes for the list container */
  listClass?: string
  /** Additional classes for each item */
  itemClass?: string
}>(), {
  itemKey: 'id',
  modelValue: undefined,
  multiSelect: false,
  selectMode: 'checkbox',
  itemActions: () => [],
  loading: false,
  disabled: false,
  listClass: '',
  itemClass: '',
})

const emit = defineEmits<{
  /** Emitted when selection changes */
  'update:modelValue': [value: string | string[]]
  /** Emitted when an item is clicked */
  'click': [item: any, event: MouseEvent]
  /** Emitted when an item action is triggered */
  'action': [key: string, item: any]
}>()

defineSlots<{
  /** Custom render for each item content */
  default: (props: { item: any, index: number }) => any
  /** Custom render for actions area */
  actions: (props: { item: any, index: number }) => any
  /** Empty state slot */
  empty: () => any
  /** Loading state slot */
  loading: () => any
  /** Header slot (above the list, includes select-all in multi-select mode) */
  header: () => any
  /** Select all label slot */
  'select-all-label': () => any
  /** Footer slot (below the list) */
  footer: () => any
}>()

// Normalize selection to array
const selectedKeys = computed(() => {
  if (!props.modelValue)
    return []
  return Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]
})

// Check if item is selected
function isSelected(item: any): boolean {
  const key = String(item[props.itemKey])
  return selectedKeys.value.includes(key)
}

// Get item key as string
function getItemKey(item: any): string {
  return String(item[props.itemKey])
}

// Handle item click
function handleItemClick(item: any, event: MouseEvent) {
  if (props.disabled)
    return

  const key = getItemKey(item)

  if (props.multiSelect) {
    // Toggle selection in multi-select mode
    const current = new Set(selectedKeys.value)
    if (current.has(key)) {
      current.delete(key)
    }
    else {
      current.add(key)
    }
    emit('update:modelValue', Array.from(current))
  }
  else {
    // Single select mode
    emit('update:modelValue', key)
  }

  emit('click', item, event)
}

// Handle checkbox toggle
function handleSelect(key: string | undefined, selected: boolean) {
  if (!key || props.disabled)
    return

  if (props.multiSelect) {
    const current = new Set(selectedKeys.value)
    if (selected) {
      current.add(key)
    }
    else {
      current.delete(key)
    }
    emit('update:modelValue', Array.from(current))
  }
}

// Handle action trigger
function handleAction(key: string, id: string | undefined) {
  if (!id || props.disabled)
    return

  const item = props.items.find(i => getItemKey(i) === id)
  if (item) {
    emit('action', key, item)
  }
}

// Check if all items are selected
const isAllSelected = computed(() => {
  if (props.items.length === 0)
    return false
  return props.items.every(item => selectedKeys.value.includes(getItemKey(item)))
})

// Toggle select all
function toggleSelectAll() {
  if (props.disabled)
    return

  if (isAllSelected.value) {
    emit('update:modelValue', [])
  }
  else {
    const allKeys = props.items.map(item => getItemKey(item))
    emit('update:modelValue', allKeys)
  }
}
</script>

<template>
  <div class="list-root">
    <!-- Header slot with optional select-all (only in checkbox mode) -->
    <div v-if="$slots.header || (multiSelect && selectMode === 'checkbox' && items.length > 0)" class="list-header">
      <label v-if="multiSelect && selectMode === 'checkbox' && items.length > 0" class="list-select-all">
        <input
          type="checkbox"
          :checked="isAllSelected"
          :indeterminate="selectedKeys.length > 0 && !isAllSelected"
          @change="toggleSelectAll"
        >
        <slot name="select-all-label">
          <span>({{ selectedKeys.length }}/{{ items.length }})</span>
        </slot>
      </label>
      <!-- Selection count for highlight mode -->
      <span v-if="multiSelect && selectMode === 'highlight' && items.length > 0" class="list-select-count">
        {{ selectedKeys.length }}/{{ items.length }}
      </span>
      <slot name="header" />
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="list-loading">
      <slot name="loading">
        <span>Loading...</span>
      </slot>
    </div>

    <!-- Empty state -->
    <div v-else-if="items.length === 0" class="list-empty">
      <slot name="empty">
        <span>No items</span>
      </slot>
    </div>

    <!-- List items -->
    <div v-else class="list-container" :class="listClass">
      <ListItem
        v-for="(item, index) in items"
        :key="getItemKey(item)"
        :id="getItemKey(item)"
        :selected="isSelected(item)"
        :selectable="multiSelect"
        :select-mode="selectMode"
        :actions="itemActions"
        :disabled="disabled"
        :item-class="itemClass"
        @click="(id, event) => handleItemClick(item, event)"
        @select="handleSelect"
        @action="handleAction"
      >
        <!-- Pass item to default slot -->
        <slot :item="item" :index="index" />

        <!-- Pass item to actions slot -->
        <template v-if="$slots.actions" #actions>
          <slot name="actions" :item="item" :index="index" />
        </template>
      </ListItem>
    </div>

    <!-- Footer slot -->
    <div v-if="$slots.footer" class="list-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.list-root {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.list-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
}

.list-select-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.list-select-count {
  font-size: 0.75rem;
  opacity: 0.6;
}

.list-loading,
.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.list-container {
  display: flex;
  flex-direction: column;
}

.list-footer {
  padding: 0.5rem;
}
</style>

<script lang="ts">
// Re-exports for external use
export { default as ListItem } from './ListItem.vue'
export type { ListItemAction, ListItemSelectMode } from './ListItem.vue'
</script>
