<script setup lang="ts">
import type { TaskPriority, TaskStatus } from '@locus-agent/shared'
import { Modal } from '@locus-agent/ui'
import { ref, watch } from 'vue'
import * as api from '@/api/tasks'
import { useTaskDetailQuery } from '@/composables/taskQueries'

const props = defineProps<{
  taskId: string | null
  projectKey: string
}>()

const emit = defineEmits<{
  close: []
  updated: []
  deleted: []
}>()

const { data: detailData } = useTaskDetailQuery(() => props.taskId)

const editTitle = ref('')
const editSpec = ref('')
const editStatus = ref<TaskStatus>('backlog')
const editPriority = ref<TaskPriority>(0)
const isSaving = ref(false)
const isDeleting = ref(false)

// Sync form fields when data loads
watch(detailData, (data) => {
  if (data?.task) {
    editTitle.value = data.task.title
    editSpec.value = data.task.spec
    editStatus.value = data.task.status
    editPriority.value = data.task.priority
  }
}, { immediate: true })

async function handleSave() {
  if (!props.taskId || !editTitle.value.trim())
    return

  isSaving.value = true
  try {
    await api.updateTask(props.taskId, {
      title: editTitle.value.trim(),
      spec: editSpec.value.trim(),
      status: editStatus.value,
      priority: editPriority.value,
    })
    emit('updated')
  }
  catch (err) {
    console.error('Failed to update task:', err)
  }
  finally {
    isSaving.value = false
  }
}

async function handleDelete() {
  if (!props.taskId)
    return

  isDeleting.value = true
  try {
    await api.deleteTask(props.taskId)
    emit('deleted')
  }
  catch (err) {
    console.error('Failed to delete task:', err)
  }
  finally {
    isDeleting.value = false
  }
}

const statusOptions = [
  { value: 'backlog', label: '待跟进' },
  { value: 'in_progress', label: '进行中' },
  { value: 'done', label: '已完成' },
]

const priorityOptions = [
  { value: 0, label: '无优先级' },
  { value: 1, label: '低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
]
</script>

<template>
  <Modal :open="!!taskId" max-width="max-w-2xl" @close="emit('close')">
    <div v-if="detailData?.task" class="flex flex-col gap-3 p-2">
      <!-- Title -->
      <input
        v-model="editTitle"
        type="text"
        class="text-base font-semibold bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/50"
        placeholder="任务标题"
      >

      <!-- Status + Priority row -->
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <label class="text-xs text-muted-foreground mb-1 block">状态</label>
          <select
            v-model="editStatus"
            class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted-foreground mb-1 block">优先级</label>
          <select
            v-model.number="editPriority"
            class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>

      <!-- Spec -->
      <div>
        <label class="text-xs text-muted-foreground mb-1 block">
          Spec / 规格说明
        </label>
        <textarea
          v-model="editSpec"
          rows="12"
          placeholder="## 目标&#10;...&#10;&#10;## 需求&#10;- ...&#10;&#10;## 验收标准&#10;- ..."
          class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      </div>

      <!-- Linked conversations -->
      <div v-if="detailData.conversationIds?.length" class="text-xs text-muted-foreground">
        <span>关联对话：{{ detailData.conversationIds.length }} 个</span>
      </div>

      <!-- AI Actions placeholder (Phase 2) -->
      <div class="flex gap-2 border-t border-border pt-2">
        <button
          type="button"
          disabled
          class="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          title="Phase 2: AI 补充 Spec"
        >
          <div class="i-carbon-machine-learning-model h-3 w-3 inline-block mr-0.5 align-middle" />
          AI 补充 Spec
        </button>
        <button
          type="button"
          disabled
          class="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          title="Phase 2: AI 拆分子任务"
        >
          <div class="i-carbon-flow h-3 w-3 inline-block mr-0.5 align-middle" />
          AI 拆分子任务
        </button>
        <button
          type="button"
          disabled
          class="px-2.5 py-1 text-xs rounded-md border border-border text-muted-foreground opacity-50 cursor-not-allowed"
          title="Phase 2: 基于 Spec 开始实现"
        >
          <div class="i-carbon-play h-3 w-3 inline-block mr-0.5 align-middle" />
          开始实现
        </button>
      </div>

      <!-- Save/Delete -->
      <div class="flex justify-between pt-1">
        <button
          type="button"
          :disabled="isDeleting"
          class="px-3 py-1 text-xs rounded-md text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          @click="handleDelete"
        >
          {{ isDeleting ? '删除中...' : '删除' }}
        </button>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-3 py-1 text-xs rounded-md hover:bg-muted transition-colors"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            :disabled="!editTitle.trim() || isSaving"
            class="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            @click="handleSave"
          >
            {{ isSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else class="p-4 text-center">
      <span class="text-xs text-muted-foreground">加载中...</span>
    </div>
  </Modal>
</template>
