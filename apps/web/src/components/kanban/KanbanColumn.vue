<script setup lang="ts">
import type { Task, TaskStatus } from '@locus-agent/agent-sdk'
import type { DraggableEvent } from 'vue-draggable-plus'
import { computed, ref } from 'vue'
import { useDraggable } from 'vue-draggable-plus'
import KanbanCard from './KanbanCard.vue'

const props = defineProps<{
  title: string
  status: TaskStatus
  tasks: Task[]
  isLoading?: boolean
}>()

const emit = defineEmits<{
  create: []
  select: [taskId: string]
  move: [taskId: string, targetStatus: TaskStatus]
  delete: [taskId: string]
  reorder: [event: { taskId: string, targetStatus: TaskStatus, targetIndex: number }]
  switchConversation: [conversationId: string]
}>()

const listRef = ref<HTMLElement | null>(null)
const taskList = computed(() => props.tasks)

useDraggable(listRef, taskList, {
  group: 'kanban',
  animation: 150,
  ghostClass: 'opacity-30',
  dragClass: 'shadow-lg',
  handle: '.kanban-card-drag',
  onEnd(evt: DraggableEvent<Task>) {
    const taskId = props.tasks[evt.oldIndex!]?.id
    if (!taskId)
      return

    // 从 DOM 获取目标列的 status
    const toEl = evt.to as HTMLElement
    const targetStatus = toEl.dataset.status as TaskStatus
    const targetIndex = evt.newIndex ?? 0

    emit('reorder', { taskId, targetStatus, targetIndex })
  },
})
</script>

<template>
  <div class="min-h-0 flex flex-col">
    <!-- Column header -->
    <div class="px-3 py-2 flex items-center justify-between border-b border-border">
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {{ title }}
        </span>
        <span class="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {{ tasks.length }}
        </span>
      </div>
      <button
        class="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="新建任务"
        @click="emit('create')"
      >
        <div class="i-carbon-add h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Card list (draggable) -->
    <div
      ref="listRef"
      :data-status="status"
      class="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1.5"
    >
      <div
        v-for="task in tasks"
        :key="task.id"
        class="kanban-card-drag"
      >
        <KanbanCard
          :task="task"
          @click="emit('select', task.id)"
          @move="(s) => emit('move', task.id, s)"
          @delete="emit('delete', task.id)"
          @switch-conversation="(cid) => emit('switchConversation', cid)"
        />
      </div>

      <!-- Empty state -->
      <div v-if="!isLoading && tasks.length === 0" class="text-center py-8">
        <span class="text-xs text-muted-foreground">暂无任务</span>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="text-center py-8">
        <span class="text-xs text-muted-foreground">加载中...</span>
      </div>
    </div>
  </div>
</template>
