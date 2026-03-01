<script setup lang="ts">
import Modal from './Modal.vue'

export interface DirectoryBrowserEntry {
  name: string
  path: string
}

withDefaults(defineProps<{
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
  confirm: []
}>()
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
        <p class="flex-1 min-w-0 text-xs text-muted-foreground truncate font-mono">
          {{ currentPath || '未选择路径' }}
        </p>
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
