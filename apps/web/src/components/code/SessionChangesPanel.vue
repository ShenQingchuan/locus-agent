<script setup lang="ts">
import type { GitChangedFile, GitStatusResponse } from '@locus-agent/shared'
import { computed, ref } from 'vue'
import ChangedFilesList from './ChangedFilesList.vue'
import DiffViewer from './DiffViewer.vue'

const props = defineProps<{
  files: GitChangedFile[]
  summary: GitStatusResponse['summary']
  isLoading: boolean
  isRefreshing: boolean
  isGitRepo: boolean
  selectedFilePath: string | null
  selectedFileStaged: boolean | undefined
  selectedFileDiff: string
  isDiffLoading: boolean
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

const diffStyle = ref<'unified' | 'split'>('unified')

const selectedFileIndex = computed(() => {
  if (!props.selectedFilePath) {
    return -1
  }
  return props.files.findIndex(f => f.filePath === props.selectedFilePath)
})

const hasPrev = computed(() => selectedFileIndex.value > 0)
const hasNext = computed(() => selectedFileIndex.value >= 0 && selectedFileIndex.value < props.files.length - 1)

function goToPrev() {
  if (hasPrev.value) {
    const file = props.files[selectedFileIndex.value - 1]!
    emit('select', file.filePath, file.staged)
  }
}

function goToNext() {
  if (hasNext.value) {
    const file = props.files[selectedFileIndex.value + 1]!
    emit('select', file.filePath, file.staged)
  }
}
</script>

<template>
  <section class="h-full min-h-0 grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
    <!-- Left: Changed files list -->
    <aside class="min-h-0 border-b xl:border-b-0 xl:border-r border-border">
      <div v-if="!isGitRepo" class="h-full flex items-center justify-center px-4">
        <div class="text-center">
          <span class="i-carbon-warning h-5 w-5 text-muted-foreground/50 mx-auto block mb-1.5" />
          <span class="text-xs text-muted-foreground">当前工作空间不是 Git 仓库</span>
        </div>
      </div>
      <ChangedFilesList
        v-else
        :files="files"
        :selected-file-path="selectedFilePath"
        :selected-file-staged="selectedFileStaged"
        :is-loading="isLoading"
        :is-refreshing="isRefreshing"
        :summary="summary"
        :unpushed-commits="unpushedCommits"
        @select="(path, staged) => emit('select', path, staged)"
        @refresh="emit('refresh')"
        @commit="emit('commit')"
        @push="emit('push')"
        @discard="emit('discard')"
        @stage="emit('stage', $event)"
        @unstage="emit('unstage', $event)"
      />
    </aside>

    <!-- Right: Diff viewer -->
    <div class="min-h-0 flex flex-col">
      <!-- Toolbar -->
      <header
        v-if="selectedFilePath"
        class="h-9 px-3 border-b border-border flex items-center gap-2"
      >
        <span class="text-xs truncate min-w-0 font-medium">
          变更详情
        </span>
        <div class="flex-shrink-0 ml-auto flex items-center gap-1">
          <!-- Split / Unified toggle -->
          <button
            class="h-6 px-1.5 rounded text-[10px] transition-colors"
            :class="[
              diffStyle === 'unified'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            ]"
            title="Unified"
            @click="diffStyle = 'unified'"
          >
            <div class="i-carbon-row-collapse h-3.5 w-3.5" />
          </button>
          <button
            class="h-6 px-1.5 rounded text-[10px] transition-colors"
            :class="[
              diffStyle === 'split'
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            ]"
            title="Split"
            @click="diffStyle = 'split'"
          >
            <div class="i-carbon-column h-3.5 w-3.5" />
          </button>

          <span class="w-px h-4 bg-border mx-1" />

          <!-- Prev / Next file -->
          <button
            class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="上一个文件"
            :disabled="!hasPrev"
            @click="goToPrev"
          >
            <span class="i-carbon-chevron-up h-3.5 w-3.5" />
          </button>
          <button
            class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="下一个文件"
            :disabled="!hasNext"
            @click="goToNext"
          >
            <span class="i-carbon-chevron-down h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <!-- Diff content -->
      <div class="flex-1 min-h-0 overflow-auto">
        <!-- No changes at all -->
        <div v-if="!isLoading && files.length === 0 && isGitRepo" class="h-full flex items-center justify-center">
          <div class="text-center">
            <span class="i-mingcute:empty-box-fill h-6 w-6 text-muted-foreground/40 mx-auto block mb-2" />
            <span class="text-xs text-muted-foreground">工作区暂无未提交的变更</span>
          </div>
        </div>

        <!-- No file selected but has changes -->
        <div v-else-if="!selectedFilePath && files.length > 0" class="h-full flex items-center justify-center">
          <div class="text-center">
            <span class="i-carbon-document-view h-6 w-6 text-muted-foreground/40 mx-auto block mb-2" />
            <span class="text-xs text-muted-foreground">选择左侧文件查看变更</span>
          </div>
        </div>

        <!-- Loading diff -->
        <div v-else-if="isDiffLoading" class="h-full flex items-center justify-center">
          <div class="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span class="i-svg-spinners:180-ring-with-bg h-4 w-4" />
            <span>正在加载 diff...</span>
          </div>
        </div>

        <!-- Diff rendered -->
        <div v-else-if="selectedFileDiff" class="p-2">
          <DiffViewer
            :patch="selectedFileDiff"
            :file-path="selectedFilePath ?? undefined"
            :diff-style="diffStyle"
          />
        </div>
      </div>
    </div>
  </section>
</template>
