<script setup lang="ts">
import type { TaskPriority, TaskStatus } from '@locus-agent/agent-sdk'
import { Modal } from '@locus-agent/ui'
import { ref, watch } from 'vue'
import * as api from '@/api/tasks'

const props = defineProps<{
  open: boolean
  projectKey: string
  initialStatus?: TaskStatus
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const title = ref('')
const spec = ref('')
const status = ref<TaskStatus>('backlog')
const priority = ref<TaskPriority>(0)
const isSubmitting = ref(false)

// Reset form when opening
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    title.value = ''
    spec.value = ''
    status.value = props.initialStatus ?? 'backlog'
    priority.value = 0
  }
})

async function handleSubmit() {
  if (!title.value.trim())
    return

  isSubmitting.value = true
  try {
    await api.createTask({
      title: title.value.trim(),
      spec: spec.value.trim(),
      status: status.value,
      priority: priority.value,
      projectKey: props.projectKey,
    })
    emit('created')
  }
  catch (err) {
    console.error('Failed to create task:', err)
  }
  finally {
    isSubmitting.value = false
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
  <Modal :open="open" max-width="max-w-lg" @close="emit('close')">
    <form class="flex flex-col gap-3 p-2" @submit.prevent="handleSubmit">
      <h2 class="text-sm font-semibold">
        新建任务
      </h2>

      <!-- Title -->
      <div>
        <label class="text-xs text-muted-foreground mb-2 block">标题</label>
        <input
          v-model="title"
          type="text"
          placeholder="简洁描述任务目标"
          class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          autofocus
        >
      </div>

      <!-- Status + Priority row -->
      <div class="flex items-center gap-3">
        <div class="flex-1">
          <label class="text-xs text-muted-foreground mb-2 block">状态</label>
          <div class="relative">
            <select
              v-model="status"
              class="w-full rounded-md border border-border bg-background appearance-none px-2 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="i-ic:twotone-keyboard-arrow-down absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div class="flex-1">
          <label class="text-xs text-muted-foreground mb-2 block">优先级</label>
          <div class="relative">
            <select
              v-model.number="priority"
              class="w-full rounded-md border border-border bg-background appearance-none px-2 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <div class="i-ic:twotone-keyboard-arrow-down absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      <!-- Spec -->
      <div>
        <label class="flex items-center text-xs text-muted-foreground mb-2 block">
          说明
          <span class="text-muted-foreground/60 text-xs ml-1">描述需求目标、验收标准</span>
        </label>
        <textarea
          v-model="spec"
          rows="8"
          placeholder="## 目标&#10;...&#10;&#10;## 需求&#10;- ...&#10;&#10;## 验收标准&#10;- ..."
          class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="px-3 py-1 text-xs rounded-md hover:bg-muted transition-colors"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          type="submit"
          :disabled="!title.trim() || isSubmitting"
          class="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ isSubmitting ? '创建中...' : '创建' }}
        </button>
      </div>
    </form>
  </Modal>
</template>
