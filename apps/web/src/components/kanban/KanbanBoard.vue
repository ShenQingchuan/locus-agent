<script setup lang="ts">
import type { TaskStatus } from '@locus-agent/shared'
import { useQueryCache } from '@pinia/colada'
import { useElementSize } from '@vueuse/core'
import { computed, ref } from 'vue'
import * as api from '@/api/tasks'
import { getTasksListQueryKey, useTasksListQuery } from '@/composables/taskQueries'
import KanbanColumn from './KanbanColumn.vue'
import TaskCreateModal from './TaskCreateModal.vue'
import TaskDetailModal from './TaskDetailModal.vue'

const props = defineProps<{
  projectKey: string
}>()

const emit = defineEmits<{
  switchConversation: [conversationId: string]
}>()

const queryCache = useQueryCache()
const { data: tasks, isPending: isLoading } = useTasksListQuery(() => props.projectKey)

const containerRef = ref<HTMLElement | null>(null)
const { width: containerWidth } = useElementSize(containerRef)
const useVerticalLayout = computed(() => containerWidth.value < 680)

const columns = [
  { status: 'backlog' as const, title: '待跟进' },
  { status: 'in_progress' as const, title: '进行中' },
  { status: 'done' as const, title: '已完成' },
]

const tasksByStatus = computed(() => {
  const all = tasks.value ?? []
  return {
    backlog: all.filter(t => t.status === 'backlog'),
    in_progress: all.filter(t => t.status === 'in_progress'),
    done: all.filter(t => t.status === 'done'),
  }
})

// --- Create Modal ---
const isCreateOpen = ref(false)
const createInitialStatus = ref<TaskStatus>('backlog')

function openCreate(status: TaskStatus = 'backlog') {
  createInitialStatus.value = status
  isCreateOpen.value = true
}

function handleCreated() {
  isCreateOpen.value = false
  invalidateTasks()
}

// --- Detail Modal ---
const selectedTaskId = ref<string | null>(null)

function selectTask(taskId: string) {
  selectedTaskId.value = taskId
}

function handleDetailClose() {
  selectedTaskId.value = null
}

function handleDetailUpdated() {
  invalidateTasks()
}

function handleDetailDeleted() {
  selectedTaskId.value = null
  invalidateTasks()
}

// --- Actions ---
async function handleMove(taskId: string, targetStatus: TaskStatus) {
  await api.updateTask(taskId, { status: targetStatus })
  invalidateTasks()
}

async function handleDelete(taskId: string) {
  await api.deleteTask(taskId)
  invalidateTasks()
}

async function handleReorder(event: { taskId: string, targetStatus: TaskStatus, targetIndex: number }) {
  await api.reorderTask(event.taskId, {
    targetStatus: event.targetStatus,
    targetIndex: event.targetIndex,
  })
  invalidateTasks()
}

function invalidateTasks() {
  queryCache.invalidateQueries({ key: getTasksListQueryKey(props.projectKey) })
}

// Expose openCreate for parent component (CodingView header button)
defineExpose({ openCreate })
</script>

<template>
  <section
    ref="containerRef"
    class="h-full min-h-0 grid divide-border"
    :class="useVerticalLayout ? 'grid-cols-1 grid-rows-3 divide-y' : 'grid-cols-3 divide-x'"
  >
    <KanbanColumn
      v-for="col in columns"
      :key="col.status"
      :title="col.title"
      :status="col.status"
      :tasks="tasksByStatus[col.status]"
      :is-loading="isLoading"
      @create="openCreate(col.status)"
      @select="selectTask"
      @move="handleMove"
      @delete="handleDelete"
      @reorder="handleReorder"
      @switch-conversation="(cid) => emit('switchConversation', cid)"
    />
  </section>

  <!-- Create Task Modal -->
  <TaskCreateModal
    :open="isCreateOpen"
    :project-key="projectKey"
    :initial-status="createInitialStatus"
    @close="isCreateOpen = false"
    @created="handleCreated"
  />

  <!-- Task Detail Modal -->
  <TaskDetailModal
    :task-id="selectedTaskId"
    :project-key="projectKey"
    @close="handleDetailClose"
    @updated="handleDetailUpdated"
    @deleted="handleDetailDeleted"
    @switch-conversation="(cid) => emit('switchConversation', cid)"
  />
</template>
