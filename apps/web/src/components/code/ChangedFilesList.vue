<script setup lang="ts">
import type { GitChangedFile, GitFileStatus, GitStatusResponse } from '@locus-agent/agent-sdk'
import { computed, ref } from 'vue'

const props = defineProps<{
  files: GitChangedFile[]
  selectedFilePath: string | null
  selectedFileStaged: boolean | undefined
  isLoading: boolean
  isRefreshing: boolean
  summary: GitStatusResponse['summary']
  unpushedCommits: number
}>()

const emit = defineEmits<{
  select: [filePath: string, staged: boolean]
  refresh: []
  commit: []
  push: []
  discard: []
  stage: [filePaths: string[]]
  unstage: [filePaths: string[]]
}>()

// --- Derived file lists from real git staging state ---
const stagedFiles = computed(() => props.files.filter(f => f.staged))
const unstagedFiles = computed(() => props.files.filter(f => !f.staged))
const isStagedCollapsed = ref(false)
const isUnstagedCollapsed = ref(false)

// --- Multi-selection state (for Shift+click range) ---
const selectedSet = ref(new Set<string>())
let anchorPath: string | null = null
let anchorInStaged: boolean | null = null

/**
 * Handle file row click:
 * - Normal click: single select + show diff
 * - Shift+click: range select from anchor (within same section)
 */
function handleRowClick(filePath: string, list: GitChangedFile[], isStaged: boolean, event: MouseEvent) {
  if (event.shiftKey && anchorPath && anchorInStaged === isStaged) {
    const anchorIdx = list.findIndex(f => f.filePath === anchorPath)
    const currentIdx = list.findIndex(f => f.filePath === filePath)
    if (anchorIdx >= 0 && currentIdx >= 0) {
      const start = Math.min(anchorIdx, currentIdx)
      const end = Math.max(anchorIdx, currentIdx)
      const next = new Set<string>()
      for (let i = start; i <= end; i++)
        next.add(list[i]!.filePath)
      selectedSet.value = next
    }
  }
  else {
    selectedSet.value = new Set([filePath])
    anchorPath = filePath
    anchorInStaged = isStaged
    emit('select', filePath, isStaged)
  }
}

function isRowSelected(filePath: string, staged: boolean): boolean {
  return selectedSet.value.has(filePath) && anchorInStaged === staged
}

function isRowActive(filePath: string, staged: boolean): boolean {
  return filePath === props.selectedFilePath && staged === (props.selectedFileStaged ?? false)
}

// --- Stage / Unstage via real git operations ---

function stage(filePath: string) {
  if (selectedSet.value.size > 1 && selectedSet.value.has(filePath) && anchorInStaged === false) {
    const paths = [...selectedSet.value].filter(p => unstagedFiles.value.some(f => f.filePath === p))
    emit('stage', paths)
    selectedSet.value = new Set()
  }
  else {
    emit('stage', [filePath])
  }
}

function unstage(filePath: string) {
  if (selectedSet.value.size > 1 && selectedSet.value.has(filePath) && anchorInStaged === true) {
    const paths = [...selectedSet.value].filter(p => stagedFiles.value.some(f => f.filePath === p))
    emit('unstage', paths)
    selectedSet.value = new Set()
  }
  else {
    emit('unstage', [filePath])
  }
}

function stageAll() {
  emit('stage', unstagedFiles.value.map(f => f.filePath))
  selectedSet.value = new Set()
}

function unstageAll() {
  emit('unstage', stagedFiles.value.map(f => f.filePath))
  selectedSet.value = new Set()
}

// --- Display helpers ---
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
  return parts.at(-1) || filePath
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-2.5 py-2 border-b border-border flex items-center justify-between">
      <div v-if="summary.totalFiles > 0" class="flex items-center gap-1 text-xs font-medium text-foreground">
        共计 <span class="font-mono">{{ summary.totalFiles }}</span> 个文件变更
      </div>
      <div v-else class="text-xs text-muted-foreground">
        暂无文件变更
      </div>

      <div class="flex items-center">
        <button
          class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="刷新"
          @click="emit('refresh')"
        >
          <span class="i-carbon-renew h-3 w-3" :class="{ 'animate-spin': isRefreshing }" />
        </button>
        <button
          class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="提交暂存的变更"
          :disabled="stagedFiles.length === 0"
          @click="emit('commit')"
        >
          <span class="i-carbon-checkmark h-3 w-3" />
        </button>
        <button
          class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :title="unpushedCommits > 0 ? `推送 ${unpushedCommits} 个提交到远程` : '没有待推送的提交'"
          :disabled="unpushedCommits <= 0"
          @click="emit('push')"
        >
          <span class="i-material-symbols:upload-2-rounded h-3 w-3" />
        </button>
        <button
          class="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="回滚全部变更"
          :disabled="summary.totalFiles === 0"
          @click="emit('discard')"
        >
          <span class="i-radix-icons:reset h-3 w-3" />
        </button>
      </div>
    </div>

    <!-- File list -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <!-- Loading -->
      <div v-if="isLoading" class="h-full flex items-center justify-center">
        <div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span class="i-svg-spinners:180-ring-with-bg h-4 w-4" />
          <span>正在检查变更...</span>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="files.length === 0" class="h-full flex items-center justify-center px-3">
        <div class="text-center">
          <span class="i-mingcute:empty-box-fill h-5 w-5 text-muted-foreground/50 mx-auto block mb-1.5" />
          <span class="text-xs text-muted-foreground">暂无文件变更</span>
        </div>
      </div>

      <!-- Two-section file list -->
      <div v-else class="py-0.5 select-none">
        <!-- Staged section -->
        <template v-if="stagedFiles.length > 0">
          <div class="px-2.5 py-1.5 flex items-center justify-between">
            <button
              class="min-w-0 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              :title="isStagedCollapsed ? '展开暂存的更改' : '收起暂存的更改'"
              @click="isStagedCollapsed = !isStagedCollapsed"
            >
              <span
                class="h-3.5 w-3.5"
                :class="isStagedCollapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'"
              />
              <span class="text-xs font-semibold">暂存的更改</span>
              <span class="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {{ stagedFiles.length }}
              </span>
            </button>
            <div class="flex items-center">
              <button
                class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="全部取消暂存"
                @click="unstageAll"
              >
                <span class="i-carbon-subtract h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <template v-if="!isStagedCollapsed">
            <div
              v-for="file in stagedFiles"
              :key="`staged-${file.filePath}`"
              class="group/file flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs transition-colors cursor-pointer"
              :class="[
                isRowSelected(file.filePath, true) ? 'bg-accent' : isRowActive(file.filePath, true) ? 'bg-accent/70' : 'hover:bg-accent/60',
              ]"
              @click="handleRowClick(file.filePath, stagedFiles, true, $event)"
            >
              <span
                class="flex-shrink-0 w-4 text-center font-mono font-semibold text-[10px] leading-4 rounded"
                :class="statusColors[file.status]"
              >{{ statusLabel(file.status) }}</span>
              <span class="truncate min-w-0 font-mono text-foreground">{{ fileName(file.filePath) }}</span>
              <div class="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                <span class="flex items-center gap-1 text-[10px] group-hover/file:hidden font-mono">
                  <span v-if="file.additions !== null" class="text-green-500 ">+{{ file.additions }}</span>
                  <span v-if="file.deletions !== null" class="text-red-500 transform-translate-y-0.1">-{{ file.deletions }}</span>
                </span>
                <button
                  class="hidden group-hover/file:inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  :title="selectedSet.size > 1 && isRowSelected(file.filePath, true) ? `取消暂存 ${selectedSet.size} 个文件` : '取消暂存'"
                  @click.stop="unstage(file.filePath)"
                >
                  <span class="i-carbon-subtract text-sm" />
                </button>
              </div>
            </div>
          </template>
        </template>

        <!-- Unstaged section -->
        <template v-if="unstagedFiles.length > 0">
          <div class="px-2.5 py-1.5 flex items-center justify-between" :class="stagedFiles.length > 0 ? 'mt-1' : ''">
            <button
              class="min-w-0 inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              :title="isUnstagedCollapsed ? '展开更改' : '收起更改'"
              @click="isUnstagedCollapsed = !isUnstagedCollapsed"
            >
              <span
                class="h-3.5 w-3.5"
                :class="isUnstagedCollapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'"
              />
              <span class="text-xs font-semibold">更改</span>
              <span class="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {{ unstagedFiles.length }}
              </span>
            </button>
            <div class="flex items-center">
              <button
                class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="全部暂存"
                @click="stageAll"
              >
                <span class="i-carbon-add text-sm" />
              </button>
            </div>
          </div>
          <template v-if="!isUnstagedCollapsed">
            <div
              v-for="file in unstagedFiles"
              :key="`unstaged-${file.filePath}`"
              class="group/file flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs transition-colors cursor-pointer"
              :class="[
                isRowSelected(file.filePath, false) ? 'bg-accent' : isRowActive(file.filePath, false) ? 'bg-accent/70' : 'hover:bg-accent/60',
              ]"
              @click="handleRowClick(file.filePath, unstagedFiles, false, $event)"
            >
              <span
                class="flex-shrink-0 w-4 text-center font-mono font-semibold text-sm leading-4 rounded"
                :class="statusColors[file.status]"
              >{{ statusLabel(file.status) }}</span>
              <span class="truncate min-w-0 font-mono text-foreground">{{ fileName(file.filePath) }}</span>
              <div class="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                <span class="flex items-center gap-1 text-[10px] group-hover/file:hidden font-mono">
                  <span v-if="file.additions !== null" class="text-green-500">+{{ file.additions }}</span>
                  <span v-if="file.deletions !== null" class="text-red-500 transform-translate-y-0.05">-{{ file.deletions }}</span>
                </span>
                <button
                  class="hidden group-hover/file:inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  :title="selectedSet.size > 1 && isRowSelected(file.filePath, false) ? `暂存 ${selectedSet.size} 个文件` : '暂存'"
                  @click.stop="stage(file.filePath)"
                >
                  <span class="i-carbon-add text-sm" />
                </button>
              </div>
            </div>
          </template>
        </template>
      </div>
    </div>

    <!-- Footer summary -->
    <div
      v-if="files.length > 0"
      class="px-2.5 py-1.5 border-t border-border text-2xs text-muted-foreground flex items-center gap-2"
    >
      <span class="text-green-500 font-mono">+{{ summary.totalAdditions }}</span>
      <span class="text-red-500 font-mono transform-translate-y-0.05">-{{ summary.totalDeletions }}</span>
    </div>
  </div>
</template>
