<script setup lang="ts">
import type { SelectedLineRange } from '@pierre/diffs'
import type { GitChangedFile, GitStatusResponse } from '@univedge/locus-agent-sdk'
import { computed, ref, toRef } from 'vue'
import { useReviewAnnotations } from '@/composables/useReviewAnnotations'
import AnnotationGroupPanel from './AnnotationGroupPanel.vue'
import AnnotationPopover from './AnnotationPopover.vue'
import ChangedFilesList from './ChangedFilesList.vue'
import DiffViewer from './DiffViewer.vue'

const props = defineProps<{
  projectKey: string
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
  submitAnnotations: [message: string]
}>()

const diffStyle = ref<'unified' | 'split'>('unified')
const isReviewPanelOpen = ref(false)

const reviewAnnotations = useReviewAnnotations(toRef(props, 'projectKey'))

const currentFileAnnotations = computed(() => {
  if (!props.selectedFilePath)
    return []
  return reviewAnnotations.getAnnotationsForFile(props.selectedFilePath)
})

// --- Annotation popover state ---
const isPopoverOpen = ref(false)
const popoverSide = ref<'additions' | 'deletions'>('additions')
const popoverLineStart = ref(1)
const popoverLineEnd = ref(1)

function handleAnnotateRequest(range: SelectedLineRange) {
  if (!props.selectedFilePath)
    return
  popoverSide.value = (range.side === 'deletions' ? 'deletions' : 'additions')
  popoverLineStart.value = Math.min(range.start, range.end)
  popoverLineEnd.value = Math.max(range.start, range.end)
  isPopoverOpen.value = true
}

function handlePopoverSubmit(payload: { groupId: string, comment: string }) {
  if (!props.selectedFilePath)
    return
  reviewAnnotations.addAnnotation(
    payload.groupId,
    props.selectedFilePath,
    popoverSide.value,
    popoverLineStart.value,
    popoverLineEnd.value,
    payload.comment,
  )
  if (!isReviewPanelOpen.value)
    isReviewPanelOpen.value = true
}

function handlePopoverCreateGroup(payload: { title: string, comment: string }) {
  if (!props.selectedFilePath)
    return
  const groupId = reviewAnnotations.createGroup(payload.title)
  reviewAnnotations.addAnnotation(
    groupId,
    props.selectedFilePath,
    popoverSide.value,
    popoverLineStart.value,
    popoverLineEnd.value,
    payload.comment,
  )
  if (!isReviewPanelOpen.value)
    isReviewPanelOpen.value = true
}

function handleSubmitGroup(groupId: string) {
  const message = reviewAnnotations.formatGroupForAI(groupId)
  if (message)
    emit('submitAnnotations', message)
}

function handleSubmitAll() {
  const messages: string[] = []
  for (const group of reviewAnnotations.groups.value) {
    const msg = reviewAnnotations.formatGroupForAI(group.id)
    if (msg)
      messages.push(msg)
  }
  if (messages.length > 0) {
    emit('submitAnnotations', messages.join('\n\n---\n\n'))
  }
}

function handleSelectFileFromPanel(filePath: string) {
  const file = props.files.find(f => f.filePath === filePath)
  if (file)
    emit('select', file.filePath, file.staged)
}

// --- Navigation ---
const selectedFileIndex = computed(() => {
  if (!props.selectedFilePath)
    return -1
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
  <section class="h-full min-h-0 flex">
    <!-- Left: Changed files list -->
    <aside class="min-h-0 min-w-[200px] flex-shrink-0 border-r border-border">
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

    <!-- Center: Diff viewer -->
    <div class="flex-1 min-w-0 min-h-0 flex flex-col">
      <!-- Toolbar -->
      <header
        v-if="selectedFilePath"
        class="h-9 px-3 border-b border-border flex items-center gap-2"
      >
        <span class="text-xs truncate min-w-0 font-medium">
          变更详情
        </span>
        <div class="flex-shrink-0 ml-auto flex items-center gap-1">
          <!-- Review panel toggle -->
          <button
            class="h-6 px-1.5 rounded text-xs transition-colors flex items-center gap-1"
            :class="[
              isReviewPanelOpen
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            ]"
            title="审阅批注面板"
            @click="isReviewPanelOpen = !isReviewPanelOpen"
          >
            <span class="i-carbon-pen h-3 w-3" />
            <span v-if="reviewAnnotations.totalAnnotationCount.value > 0" class="text-xs tabular-nums">
              {{ reviewAnnotations.totalAnnotationCount.value }}
            </span>
          </button>

          <span class="w-px h-4 bg-border mx-1" />

          <!-- Split / Unified toggle -->
          <button
            class="h-6 px-1.5 rounded text-xs transition-colors"
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
            class="h-6 px-1.5 rounded text-xs transition-colors"
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
            <span class="i-material-symbols:person-play h-6 w-6 text-muted-foreground/40 mx-auto block mb-2" />
            <span class="text-xs text-muted-foreground">现在就去开始编码吧！</span>
          </div>
        </div>

        <!-- No file selected but has changes -->
        <div v-else-if="!selectedFilePath && files.length > 0" class="h-full flex items-center justify-center">
          <div class="text-center">
            <span class="i-carbon-document-view h-6 w-6 text-muted-foreground/40 mx-auto block mb-2" />
            <span class="text-xs text-muted-foreground">选择文件查看变更</span>
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
            enable-annotation
            :annotations="currentFileAnnotations"
            @annotate="handleAnnotateRequest"
          />
        </div>
      </div>
    </div>

    <!-- Right: Annotation review panel -->
    <aside
      v-if="isReviewPanelOpen"
      class="min-h-0 w-[280px] flex-shrink-0 border-l border-border"
    >
      <AnnotationGroupPanel
        :groups="reviewAnnotations.groups.value"
        :active-group-id="reviewAnnotations.activeGroupId.value"
        @set-active="reviewAnnotations.setActiveGroup"
        @delete-group="reviewAnnotations.deleteGroup"
        @rename-group="reviewAnnotations.renameGroup"
        @remove-annotation="reviewAnnotations.removeAnnotation"
        @submit-group="handleSubmitGroup"
        @submit-all="handleSubmitAll"
        @select-file="handleSelectFileFromPanel"
        @clear-all="reviewAnnotations.clearAll"
      />
    </aside>

    <!-- Annotation popover -->
    <AnnotationPopover
      :open="isPopoverOpen"
      :side="popoverSide"
      :line-start="popoverLineStart"
      :line-end="popoverLineEnd"
      :groups="reviewAnnotations.groups.value"
      :active-group-id="reviewAnnotations.activeGroupId.value"
      @close="isPopoverOpen = false"
      @submit="handlePopoverSubmit"
      @create-group="handlePopoverCreateGroup"
    />
  </section>
</template>
