<script setup lang="ts">
import type { GitChangedFile, GitFileStatus, GitStatusResponse } from '@locus-agent/shared'

defineProps<{
  files: GitChangedFile[]
  selectedFilePath: string | null
  isLoading: boolean
  summary: GitStatusResponse['summary']
}>()

const emit = defineEmits<{
  select: [filePath: string]
  refresh: []
  commit: []
  discard: []
}>()

const statusColors: Record<GitFileStatus, string> = {
  'M': 'text-yellow-500 bg-yellow-500/10',
  'A': 'text-green-500 bg-green-500/10',
  'D': 'text-red-500 bg-red-500/10',
  'R': 'text-blue-500 bg-blue-500/10',
  'U': 'text-orange-500 bg-orange-500/10',
  '??': 'text-green-500 bg-green-500/10',
}

function statusLabel(status: GitFileStatus): string {
  return status === '??' ? 'N' : status
}

function fileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

function fileDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) {
    return ''
  }
  return parts.slice(0, -1).join('/')
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-2.5 py-2 border-b border-border flex items-center justify-between">
      <span class="text-xs font-medium text-foreground">
        变更
        <span v-if="summary.totalFiles > 0" class="text-muted-foreground">({{ summary.totalFiles }})</span>
      </span>
      <div class="flex items-center gap-0.5">
        <button
          class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="刷新"
          @click="emit('refresh')"
        >
          <span class="i-carbon-renew h-3.5 w-3.5" />
        </button>
        <button
          class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="提交"
          :disabled="summary.totalFiles === 0"
          @click="emit('commit')"
        >
          <span class="i-carbon-checkmark h-3.5 w-3.5" />
        </button>
        <button
          class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="回滚全部"
          :disabled="summary.totalFiles === 0"
          @click="emit('discard')"
        >
          <span class="i-carbon-reset h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- File list -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div v-if="isLoading" class="h-full flex items-center justify-center">
        <div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span class="i-carbon-circle-dash h-4 w-4 animate-spin" />
          <span>正在检查变更...</span>
        </div>
      </div>
      <div v-else-if="files.length === 0" class="h-full flex items-center justify-center px-3">
        <div class="text-center">
          <span class="i-carbon-checkmark-outline h-5 w-5 text-muted-foreground/50 mx-auto block mb-1.5" />
          <span class="text-xs text-muted-foreground">暂无文件变更</span>
        </div>
      </div>
      <div v-else class="py-1">
        <button
          v-for="file in files"
          :key="file.filePath"
          class="w-full text-left px-2.5 py-1.5 text-xs transition-colors"
          :class="[
            file.filePath === selectedFilePath ? 'bg-accent' : 'hover:bg-accent/60',
          ]"
          @click="emit('select', file.filePath)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="flex-shrink-0 w-4 text-center font-mono font-semibold text-[10px] leading-4 rounded" :class="[
                statusColors[file.status],
              ]"
            >{{ statusLabel(file.status) }}</span>
            <span class="truncate min-w-0 font-mono text-foreground">{{ fileName(file.filePath) }}</span>
            <span v-if="fileDir(file.filePath)" class="truncate min-w-0 text-muted-foreground/60 font-mono">
              {{ fileDir(file.filePath) }}
            </span>
            <span class="flex-shrink-0 ml-auto flex items-center gap-1 text-[10px]">
              <span v-if="file.additions !== null" class="text-green-500">+{{ file.additions }}</span>
              <span v-if="file.deletions !== null" class="text-red-500">-{{ file.deletions }}</span>
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Footer summary -->
    <div
      v-if="files.length > 0"
      class="px-2.5 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center gap-2"
    >
      <span class="text-green-500">+{{ summary.totalAdditions }}</span>
      <span class="text-red-500">-{{ summary.totalDeletions }}</span>
    </div>
  </div>
</template>
