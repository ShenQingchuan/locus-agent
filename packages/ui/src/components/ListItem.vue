<script setup lang="ts">
import { computed } from 'vue'

export interface ListItemAction {
  /** Action key */
  key: string
  /** Icon class (UnoCSS icon) */
  icon?: string
  /** Tooltip text */
  tooltip?: string
}

export type ListItemSelectMode = 'checkbox' | 'highlight'

const props = withDefaults(defineProps<{
  /** Item ID (required for selection) */
  id?: string
  /** Whether this item is selected */
  selected?: boolean
  /** Whether this item is active/highlighted */
  active?: boolean
  /** Whether this item is in multi-select mode */
  selectable?: boolean
  /** Selection mode: 'checkbox' shows checkbox, 'highlight' uses background color */
  selectMode?: ListItemSelectMode
  /** Actions to show on hover */
  actions?: ListItemAction[]
  /** Disable the item */
  disabled?: boolean
  /** Additional classes for the item wrapper */
  itemClass?: string
}>(), {
  selected: false,
  active: false,
  selectable: false,
  selectMode: 'checkbox',
  actions: () => [],
  disabled: false,
  itemClass: '',
})

const emit = defineEmits<{
  /** Emitted when item is clicked */
  click: [id: string | undefined, event: MouseEvent]
  /** Emitted when checkbox state changes */
  select: [id: string | undefined, selected: boolean]
  /** Emitted when an action is triggered */
  action: [key: string, id: string | undefined]
}>()

const checkboxModel = computed({
  get: () => props.selected,
  set: (val: boolean) => emit('select', props.id, val),
})

function handleClick(event: MouseEvent) {
  if (props.disabled)
    return

  // In highlight mode with selectable, clicking toggles selection
  if (props.selectable && props.selectMode === 'highlight') {
    emit('select', props.id, !props.selected)
  }

  emit('click', props.id, event)
}

function handleActionClick(e: MouseEvent, key: string) {
  e.stopPropagation()
  if (props.disabled)
    return
  emit('action', key, props.id)
}

function handleCheckboxClick(e: MouseEvent) {
  e.stopPropagation()
}
</script>

<template>
  <div
    class="relative w-full group"
    :class="[disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer', itemClass]"
    :data-selected="selected"
    :data-select-mode="selectable ? selectMode : undefined"
    @click="handleClick"
  >
    <div class="flex items-center">
      <!-- Checkbox (only in checkbox mode) -->
      <label
        v-if="selectable && selectMode === 'checkbox'"
        class="flex-shrink-0"
        :class="disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
        @click="handleCheckboxClick"
      >
        <input
          v-model="checkboxModel"
          type="checkbox"
          :disabled="disabled"
          class="list-item-checkbox"
        >
      </label>

      <!-- Default content slot -->
      <div class="flex-1 min-w-0">
        <slot />
      </div>

      <!-- Actions (visible on hover, always visible in selectable mode) -->
      <div
        v-if="!$slots.actions && actions.length > 0"
        class="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'opacity-100': selectable }"
      >
        <button
          v-for="action in actions"
          :key="action.key"
          :title="action.tooltip"
          class="list-item-action"
          @click="(e) => handleActionClick(e, action.key)"
        >
          <div v-if="action.icon" :class="action.icon" class="list-item-action-icon" />
        </button>
      </div>

      <!-- Custom actions slot (takes precedence) -->
      <div
        v-if="$slots.actions"
        class="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        :class="{ 'opacity-100': selectable }"
        @click.stop
      >
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-item-action {
  padding: 0.25rem;
  background: transparent;
  border: none;
  cursor: pointer;
}

.list-item-action-icon {
  width: 1rem;
  height: 1rem;
  display: block;
}
</style>
