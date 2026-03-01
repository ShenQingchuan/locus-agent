<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import Modal from './Modal.vue'

export interface DirectoryBrowserEntry {
  name: string
  path: string
}

const props = withDefaults(defineProps<{
  open: boolean
  currentPath: string
  entries: DirectoryBrowserEntry[]
  loading?: boolean
  truncated?: boolean
  confirmLoading?: boolean
  title?: string
  emptyText?: string
  confirmText?: string
}>(), {
  loading: false,
  truncated: false,
  confirmLoading: false,
  title: '选择工作空间目录',
  emptyText: '当前目录没有可浏览的子目录',
  confirmText: '打开此目录',
})

const emit = defineEmits<{
  close: []
  refresh: []
  goParent: []
  navigate: [path: string]
  submitPath: [path: string]
  confirm: []
}>()

const isEditingPath = ref(false)
const draftPath = ref('')
let submitTimer: ReturnType<typeof setTimeout> | null = null

function clearSubmitTimer() {
  if (!submitTimer) {
    return
  }
  clearTimeout(submitTimer)
  submitTimer = null
}

function emitSubmitPath(path: string) {
  const nextPath = path.trim()
  if (nextPath) {
    emit('submitPath', nextPath)
  }
}

function scheduleSubmitPath(path: string) {
  clearSubmitTimer()
  submitTimer = setTimeout(() => {
    emitSubmitPath(path)
    submitTimer = null
  }, 260)
}

watch(() => props.currentPath, (path) => {
  if (!isEditingPath.value) {
    draftPath.value = path
  }
}, { immediate: true })

watch(draftPath, (path) => {
  if (!isEditingPath.value) {
    return
  }
  scheduleSubmitPath(path)
})

onBeforeUnmount(() => {
  clearSubmitTimer()
})

function startEditPath() {
  isEditingPath.value = true
  draftPath.value = props.currentPath
}

function cancelEditPath() {
  clearSubmitTimer()
  isEditingPath.value = false
  draftPath.value = props.currentPath
}

function submitPath() {
  clearSubmitTimer()
  emitSubmitPath(draftPath.value)
  isEditingPath.value = false
}
</script>

<template>
  <Modal
    :open="open"
    max-width="max-w-2xl"
    panel-class="p-0"
    @close="emit('close')"
  >
    <div class="h-[72vh] min-h-0 flex flex-col">
      <div class="h-12 px-4 border-b border-border flex items-center justify-between">
        <p class="text-sm font-semibold">
          {{ title }}
        </p>
        <button
          class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="关闭"
          @click="emit('close')"
        >
          <span class="i-carbon-close h-4 w-4" />
        </button>
      </div>

      <div class="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <button
          class="h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading"
          @click="emit('goParent')"
        >
          <span class="inline-flex items-center gap-1">
            <span class="i-carbon-arrow-up h-3.5 w-3.5" />
            上一级
          </span>
        </button>
        <button
          class="h-7 px-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading || !currentPath"
          @click="emit('refresh')"
        >
          <span class="inline-flex items-center gap-1">
            <span class="i-carbon-renew h-3.5 w-3.5" />
            刷新
          </span>
        </button>
        <button
          v-if="!isEditingPath"
          class="flex-1 min-w-0 h-7 px-2 rounded text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          @click="startEditPath"
        >
          <span class="truncate block font-mono">{{ currentPath || '未选择路径' }}</span>
        </button>
        <input
          v-else
          v-model="draftPath"
          type="text"
          class="flex-1 min-w-0 h-7 px-2 rounded border border-border bg-background text-xs text-foreground font-mono outline-none ring-0"
          placeholder="输入路径后回车"
          @keydown.enter.prevent="submitPath"
          @keydown.esc.prevent="cancelEditPath"
          @blur="submitPath"
        >
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div v-if="loading" class="h-full flex items-center justify-center">
          <div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span class="i-carbon-circle-dash h-4 w-4 animate-spin" />
            <span>正在读取目录...</span>
          </div>
        </div>
        <div v-else-if="entries.length === 0" class="h-full flex items-center justify-center">
          <div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span class="i-carbon-folder-open h-4 w-4" />
            <span>{{ emptyText }}</span>
          </div>
        </div>
        <div v-else class="space-y-0.5">
          <button
            v-for="entry in entries"
            :key="entry.path"
            class="w-full h-9 px-2.5 rounded text-left text-sm text-foreground hover:bg-accent/60 transition-colors"
            @click="emit('navigate', entry.path)"
          >
            <span class="inline-flex items-center gap-2 min-w-0">
              <span class="i-carbon-folder h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span class="truncate font-mono">{{ entry.name }}</span>
              <span class="i-carbon-chevron-right h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
            </span>
          </button>
        </div>
      </div>

      <div class="pt-4 h-12 px-4 border-t border-border flex items-center justify-between gap-2">
        <p v-if="truncated" class="text-[11px] text-muted-foreground">
          当前目录条目过多，已分页裁剪展示
        </p>
        <span v-else class="text-[11px] text-muted-foreground">选择目录后点击打开</span>
        <div class="ml-auto flex items-center gap-2">
          <button
            class="h-8 px-3 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="h-8 px-3 rounded text-xs bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!currentPath || confirmLoading"
            @click="emit('confirm')"
          >
            <span class="inline-flex items-center gap-1.5">
              <span v-if="confirmLoading" class="i-svg-spinners:90-ring-with-bg h-3.5 w-3.5 animate-spin" />
              {{ confirmText }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
