<script setup lang="ts">
import type { Conversation } from '@locus-agent/shared'
import { List, useToast } from '@locus-agent/ui'
import { computed, ref } from 'vue'
import ConversationListItem from './ConversationListItem.vue'

const props = defineProps<{
  conversations: Conversation[]
  currentId?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

const toast = useToast()

/** Multi-select state - stores selected conversation IDs */
const selectedIds = ref<Set<string>>(new Set())

/** Whether currently in multi-select mode */
const isMultiSelectMode = computed(() => selectedIds.value.size > 0)

/**
 * Compute model value for List component
 * - In multi-select mode: use selectedIds
 * - In single-select mode: use currentId
 */
const modelValue = computed(() => {
  if (isMultiSelectMode.value) {
    return Array.from(selectedIds.value)
  }
  // Single select: highlight currentId
  return props.currentId ? [props.currentId] : []
})

/**
 * Handle item click with Cmd/Ctrl multi-select support
 * - Normal click: single select, clear multi-select state
 * - Cmd/Ctrl + click: toggle multi-select for this item
 */
function handleItemClick(item: Conversation, event: MouseEvent) {
  const isMetaKeyPressed = event.metaKey || event.ctrlKey

  if (isMetaKeyPressed) {
    // Multi-select mode: toggle this item
    const newSet = new Set(selectedIds.value)
    if (newSet.has(item.id)) {
      newSet.delete(item.id)
    }
    else {
      newSet.add(item.id)
    }
    selectedIds.value = newSet

    // If all items are deselected, exit multi-select mode
    if (selectedIds.value.size === 0) {
      // Keep the clicked item as current
      emit('select', item.id)
    }
  }
  else {
    // Normal click: single select, clear multi-select
    selectedIds.value.clear()
    emit('select', item.id)
  }
}

/** Exit multi-select mode */
function exitMultiSelect() {
  selectedIds.value.clear()
}

/** Delete selected conversations in batch */
async function deleteSelected() {
  if (selectedIds.value.size === 0)
    return

  const confirmed = await toast.confirm({
    title: '批量删除对话',
    message: `确定要删除选中的 ${selectedIds.value.size} 个对话吗？删除后无法恢复。`,
    confirmText: '删除',
    cancelText: '取消',
    type: 'error',
  })

  if (confirmed) {
    const ids = Array.from(selectedIds.value)
    for (const id of ids) {
      emit('delete', id)
    }
    selectedIds.value.clear()
  }
}
</script>

<template>
  <List
    :items="conversations"
    item-key="id"
    :model-value="modelValue"
    select-mode="highlight"
    :loading="loading"
    list-class="space-y-1"
    item-class="conversation-list-item rounded-lg transition-colors duration-150 text-sidebar-foreground px-3 py-2.5"
    :class="{ 'px-2 py-2': !loading && conversations.length > 0 }"
    @click="handleItemClick"
  >
    <template #header>
      <!-- Multi-select toolbar -->
      <div
        v-if="isMultiSelectMode"
        class="flex items-center justify-between w-full px-2 py-1 mb-1 rounded-md bg-accent/30 text-xs"
      >
        <span class="text-muted-foreground leading-none whitespace-nowrap">
          已选 {{ selectedIds.size }} 项
        </span>
        <div class="flex items-center gap-1">
          <button
            class="px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:bg-accent/70 transition-colors whitespace-nowrap"
            @click="exitMultiSelect"
          >
            取消
          </button>
          <button
            class="px-1.5 py-0.5 rounded text-[11px] text-destructive hover:bg-destructive/10 transition-colors whitespace-nowrap"
            @click="deleteSelected"
          >
            批量删除
          </button>
        </div>
      </div>
    </template>

    <template #loading>
      <div class="flex-col-center py-8 text-muted-foreground">
        <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
        <span class="text-xs mt-2 opacity-70">加载中...</span>
      </div>
    </template>

    <template #empty>
      <div class="flex-col-center py-8 text-muted-foreground">
        <div class="i-carbon-chat h-8 w-8 opacity-30" />
        <span class="text-xs mt-2 opacity-70">暂无对话</span>
      </div>
    </template>

    <template #default="{ item }">
      <ConversationListItem :conversation="item" />
    </template>

    <template #actions="{ item }">
      <button
        class="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors duration-150"
        title="删除对话"
        @click.stop="emit('delete', item.id)"
      >
        <div class="i-carbon-trash-can h-3.5 w-3.5" />
      </button>
    </template>
  </List>
</template>

<style>
/* Level 1: hover */
.conversation-list-item:hover {
  background-color: hsl(var(--sidebar-accent) / 0.55);
}

/* Level 2: selected */
.conversation-list-item[data-selected="true"] {
  background-color: hsl(var(--sidebar-accent) / 0.8);
}

.conversation-list-item[data-selected="true"]:hover {
  background-color: hsl(var(--sidebar-accent) / 0.9);
}
</style>
