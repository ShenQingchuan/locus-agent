<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
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
const activeEntryIndex = ref(-1)
const isTabCompleting = ref(false)
const entryListRef = ref<HTMLElement | null>(null)
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
  if (isTabCompleting.value) {
    return
  }
  activeEntryIndex.value = -1
  scheduleSubmitPath(path)
})

watch(() => props.entries, () => {
  if (!isTabCompleting.value) {
    activeEntryIndex.value = -1
  }
})

onBeforeUnmount(() => {
  clearSubmitTimer()
})

function startEditPath() {
  isEditingPath.value = true
  activeEntryIndex.value = -1
  draftPath.value = props.currentPath
}

function cancelEditPath() {
  clearSubmitTimer()
  isEditingPath.value = false
  activeEntryIndex.value = -1
  draftPath.value = props.currentPath
}

function submitPath() {
  clearSubmitTimer()
  emitSubmitPath(draftPath.value)
  isEditingPath.value = false
}

function cycleEntry(direction: 1 | -1) {
  const length = props.entries.length
  if (length === 0) {
    return
  }

  const nextIndex = activeEntryIndex.value < 0
    ? (direction > 0 ? 0 : length - 1)
    : (activeEntryIndex.value + direction + length) % length

  activeEntryIndex.value = nextIndex
  const entry = props.entries[nextIndex]!

  isTabCompleting.value = true
  clearSubmitTimer()
  draftPath.value = entry.path

  nextTick(() => {
    isTabCompleting.value = false
    const el = entryListRef.value?.children[nextIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  })
}

async function handleTabKey(event: KeyboardEvent) {
  // Flush any pending debounced submit so entries reflect current input keyword
  if (submitTimer) {
    clearSubmitTimer()
    emitSubmitPath(draftPath.value)
    // Wait for parent to filter entries and Vue to propagate the prop update
    await nextTick()
  }

  if (props.entries.length === 0) {
    return
  }

  // Single match: auto-complete and trigger navigation into the directory
  if (props.entries.length === 1) {
    const entry = props.entries[0]!
    isTabCompleting.value = true
    clearSubmitTimer()
    activeEntryIndex.value = -1
    draftPath.value = `${entry.path}/`

    nextTick(() => {
      isTabCompleting.value = false
      emitSubmitPath(draftPath.value)
    })
    return
  }

  // Multiple matches: cycle through entries
  cycleEntry(event.shiftKey ? -1 : 1)
}

function handleEnterKey() {
  // If tab-cycling with an active entry, navigate into it
  if (activeEntryIndex.value >= 0 && props.entries[activeEntryIndex.value]) {
    const entry = props.entries[activeEntryIndex.value]!
    activeEntryIndex.value = -1
    isEditingPath.value = false
    emit('navigate', entry.path)
    return
  }
  submitPath()
}

function handleBlur() {
  activeEntryIndex.value = -1
  submitPath()
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
          placeholder="输入路径后回车，Tab 补全"
          @keydown.enter.prevent="handleEnterKey"
          @keydown.esc.prevent="cancelEditPath"
          @keydown.tab.prevent="handleTabKey"
          @blur="handleBlur"
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
        <div v-else ref="entryListRef" class="space-y-0.5">
          <button
            v-for="(entry, index) in entries"
            :key="entry.path"
            class="w-full h-9 px-2.5 rounded text-left text-sm text-foreground transition-colors" :class="[
              index === activeEntryIndex ? 'bg-accent' : 'hover:bg-accent/60',
            ]"
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
