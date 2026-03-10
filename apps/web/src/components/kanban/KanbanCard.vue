<script setup lang="ts">
import type { Task } from '@locus-agent/agent-sdk'
import type { DropdownItem } from '@locus-agent/ui'
import { Dropdown } from '@locus-agent/ui'
import { computed } from 'vue'

const props = defineProps<{
  task: Task
}>()

const emit = defineEmits<{
  click: []
  move: [status: 'backlog' | 'in_progress' | 'done']
  delete: []
  switchConversation: [conversationId: string]
}>()

const RE_MARKDOWN_CHARS = /[#*`>\-[\]]/g

const priorityConfig = {
  1: { label: '低', class: 'bg-blue-500/15 text-blue-600' },
  2: { label: '中', class: 'bg-amber-500/15 text-amber-600' },
  3: { label: '高', class: 'bg-red-500/15 text-red-600' },
} as const

const priority = computed(() => {
  const p = props.task.priority as 1 | 2 | 3
  return p > 0 ? priorityConfig[p] : null
})

const specPreview = computed(() => {
  if (!props.task.spec)
    return ''
  return props.task.spec.replace(RE_MARKDOWN_CHARS, '').slice(0, 100)
})

const moveItems = computed<DropdownItem[]>(() => {
  const items: DropdownItem[] = []
  if (props.task.status !== 'backlog')
    items.push({ key: 'backlog', label: '移入待跟进', icon: 'i-carbon-list' })
  if (props.task.status !== 'in_progress')
    items.push({ key: 'in_progress', label: '移入进行中', icon: 'i-carbon-in-progress' })
  if (props.task.status !== 'done')
    items.push({ key: 'done', label: '移入已完成', icon: 'i-carbon-checkmark-outline' })
  items.push({ key: 'delete', label: '删除', icon: 'i-carbon-trash-can', separator: true })
  return items
})

function handleAction(key: string) {
  if (key === 'delete') {
    emit('delete')
  }
  else {
    emit('move', key as 'backlog' | 'in_progress' | 'done')
  }
}
</script>

<template>
  <div
    class="group rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/30 cursor-pointer transition-colors"
    @click="emit('click')"
  >
    <div class="flex items-start justify-between gap-1">
      <span class="text-sm font-medium leading-tight line-clamp-2">{{ task.title }}</span>
      <Dropdown :items="moveItems" placement="bottom-end" @select="handleAction">
        <template #trigger>
          <button
            class="opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded hover:bg-muted transition-opacity"
            @click.stop
          >
            <div class="i-carbon-overflow-menu-vertical h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </template>
      </Dropdown>
    </div>
    <p v-if="specPreview" class="mt-1 text-xs text-muted-foreground line-clamp-2">
      {{ specPreview }}
    </p>
    <div class="mt-1.5 flex items-center gap-1.5">
      <span
        v-if="priority"
        class="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium"
        :class="priority.class"
      >
        {{ priority.label }}
      </span>
      <button
        v-if="task.conversationId"
        class="inline-flex items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors"
        title="跳转到关联对话"
        @click.stop="emit('switchConversation', task.conversationId!)"
      >
        <div class="i-carbon-chat h-3 w-3" />
      </button>
    </div>
  </div>
</template>
