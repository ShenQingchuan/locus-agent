<script setup lang="ts">
import type { NoteWithTags } from '@locus-agent/shared'
import { useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppNavRail from '@/components/AppNavRail.vue'
import NoteEditor from '@/components/knowledge/NoteEditor.vue'
import {
  useFoldersQuery,
  useNoteQuery,
  useNotesListQuery,
  useSearchNotesQuery,
  useTagsQuery,
} from '@/composables/knowledgeQueries'
import { useResizePanel } from '@/composables/useResizePanel'
import { buildFolderTree, useKnowledgeStore } from '@/stores/knowledge'

const store = useKnowledgeStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const queryCache = useQueryCache()

const selectedFolderId = computed(() => store.selectedFolderId)
const selectedTagId = computed(() => store.selectedTagId)
const currentNoteId = computed(() => store.currentNoteId)
const searchQuery = computed(() => store.searchQuery)

const { data: notesList, isPending: isNotesLoading } = useNotesListQuery(selectedFolderId, selectedTagId)
const { data: searchResults, isPending: isSearchLoading } = useSearchNotesQuery(searchQuery)
const { data: folders } = useFoldersQuery()
const { data: tags } = useTagsQuery()
const { data: noteDetail } = useNoteQuery(currentNoteId)

const notes = computed(() => {
  if (store.searchQuery.trim())
    return searchResults.value ?? []
  return notesList.value ?? []
})
const isLoading = computed(() => store.searchQuery.trim() ? isSearchLoading.value : isNotesLoading.value)
const folderTree = computed(() => buildFolderTree(folders.value ?? [], null))
const tagsList = computed(() => tags.value ?? [])

const currentNote = computed(() => noteDetail.value ?? null)
const currentEditorState = computed(() =>
  currentNote.value?.editorState as Record<string, unknown> | null ?? null,
)

// ==================== 侧边栏 resize ====================

const savedWidth = Number(localStorage.getItem('knowledge-sidebar-width')) || 280
const { width: sidebarWidth, panelRef: sidebarRef, isResizing, handleMouseDown } = useResizePanel({
  initialWidth: savedWidth,
  minWidth: 220,
  maxWidth: 420,
  onWidthChange: w => localStorage.setItem('knowledge-sidebar-width', String(w)),
})

// ==================== 笔记编辑状态 ====================

const titleInput = ref<HTMLInputElement | null>(null)
const editTitle = ref('')

// ==================== 侧边栏状态 ====================

const isCreatingFolder = ref(false)
const newFolderName = ref('')
const searchInput = ref('')
const showFolders = ref(true)
const showTags = ref(false)

// ==================== 生命周期 ====================

watch(() => route.query.note as string | undefined, (noteId) => {
  if (noteId && noteId !== store.currentNoteId)
    store.selectNote(noteId)
}, { immediate: true })

watch(() => store.currentNoteId, (id) => {
  const currentQuery = route.query.note as string | undefined
  if (id !== currentQuery)
    router.replace({ query: id ? { note: id } : {} })
})

watch(currentNote, (note) => {
  if (note)
    editTitle.value = note.title
  else
    editTitle.value = ''
})

// ==================== 笔记操作 ====================

async function handleCreateNote() {
  const note = await store.createNote()
  queryCache.setQueryData(['note', note.id], note)
  queryCache.invalidateQueries({ key: ['notes'] })
  editTitle.value = note.title
  setTimeout(() => titleInput.value?.select(), 0)
}

function handleSelectNote(id: string) {
  store.selectNote(id)
}

async function saveTitle() {
  if (!currentNote.value || editTitle.value === currentNote.value.title)
    return
  const updated = await store.saveCurrentNote({ title: editTitle.value })
  if (updated && store.currentNoteId) {
    queryCache.setQueryData(['note', store.currentNoteId], updated)
    queryCache.invalidateQueries({ key: ['notes'] })
  }
}

interface EditorChangeData {
  editorState: Record<string, unknown>
  content: string
}

interface EditorSaveTask {
  changeId: number
  noteId: string
  data: EditorChangeData
}

let latestEditorChangeId = 0
let isEditorSaveQueueRunning = false
let pendingEditorSaveTask: EditorSaveTask | null = null

async function runEditorSaveQueue() {
  if (isEditorSaveQueueRunning)
    return

  isEditorSaveQueueRunning = true
  try {
    while (pendingEditorSaveTask) {
      const task = pendingEditorSaveTask
      pendingEditorSaveTask = null

      // Ignore stale tasks and tasks for a note that is no longer active.
      if (task.changeId !== latestEditorChangeId || task.noteId !== store.currentNoteId) {
        continue
      }

      const updated = await store.saveCurrentNote({
        content: task.data.content,
        editorState: task.data.editorState,
      })

      // Re-check after await to prevent stale responses from overwriting newer edits.
      if (!updated || task.changeId !== latestEditorChangeId || task.noteId !== store.currentNoteId) {
        continue
      }

      queryCache.setQueryData(['note', task.noteId], updated)
      queryCache.invalidateQueries({ key: ['notes'] })
    }
  }
  finally {
    isEditorSaveQueueRunning = false
    if (pendingEditorSaveTask) {
      void runEditorSaveQueue()
    }
  }
}

function enqueueEditorSave(task: EditorSaveTask) {
  pendingEditorSaveTask = task
  void runEditorSaveQueue()
}

const debouncedEditorSave = useDebounceFn((task: EditorSaveTask) => {
  enqueueEditorSave(task)
}, 1000)

function handleEditorChange(data: EditorChangeData) {
  if (!store.currentNoteId)
    return

  const task: EditorSaveTask = {
    changeId: ++latestEditorChangeId,
    noteId: store.currentNoteId,
    data,
  }

  // Formatting-only changes (e.g. code block language attrs) don't change plain text content.
  // Save them immediately to avoid losing attrs on quick refresh.
  if (currentNote.value && data.content === currentNote.value.content) {
    enqueueEditorSave(task)
    return
  }

  debouncedEditorSave(task)
}

async function handleDeleteNote() {
  if (!store.currentNoteId)
    return
  const confirmed = await toast.confirm({
    title: '删除笔记',
    message: '确定要删除这篇笔记吗？删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    type: 'error',
  })
  if (confirmed) {
    const id = store.currentNoteId
    await store.removeNote(id)
    queryCache.invalidateQueries({ key: ['notes'] })
    queryCache.invalidateQueries({ key: ['note', id], exact: true })
    toast.success('笔记已删除')
  }
}

// ==================== 侧边栏操作 ====================

function handleSearch() {
  store.search(searchInput.value)
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim())
    return
  await store.createFolder(newFolderName.value.trim())
  queryCache.invalidateQueries({ key: ['folders'] })
  newFolderName.value = ''
  isCreatingFolder.value = false
  showFolders.value = true
}

function cancelCreateFolder() {
  isCreatingFolder.value = false
  newFolderName.value = ''
}

// ==================== 工具函数 ====================

function formatSaveTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000)
    return '刚刚'
  if (diff < 3600_000)
    return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000)
    return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 604800_000)
    return `${Math.floor(diff / 86400_000)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getPreview(note: NoteWithTags): string {
  return (note.content || '').slice(0, 100).replace(/\n/g, ' ') || '空笔记'
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <!-- App Navigation Rail -->
    <AppNavRail />

    <!-- Sidebar: folders/tags + note list (unified) -->
    <div class="relative flex h-full flex-shrink-0">
      <aside
        ref="sidebarRef"
        class="flex flex-col h-full bg-sidebar-background border-r border-sidebar-border overflow-hidden"
        :class="isResizing ? '' : 'transition-[width] duration-150'"
        :style="{ width: `${sidebarWidth}px` }"
      >
        <!-- Search + New Note -->
        <div class="flex-shrink-0 p-2.5 border-b border-sidebar-border flex items-center gap-2">
          <div class="relative flex-1">
            <div class="i-carbon-search absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              v-model="searchInput"
              type="text"
              placeholder="搜索笔记..."
              class="w-full h-7 pl-7 pr-2 rounded-md border border-sidebar-border bg-transparent text-xs text-sidebar-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
              @input="handleSearch"
            >
          </div>
          <button
            class="flex-center h-7 w-7 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors flex-shrink-0"
            title="新建笔记"
            @click="handleCreateNote"
          >
            <div class="i-carbon-add h-4 w-4" />
          </button>
        </div>

        <!-- Folders / Tags nav -->
        <div class="flex-shrink-0 border-b border-sidebar-border">
          <!-- All notes -->
          <button
            class="w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors duration-100"
            :class="store.selectedFolderId === null && !store.selectedTagId
              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
              : 'text-sidebar-foreground hover:bg-sidebar-accent/50'"
            @click="store.selectFolder(null)"
          >
            <div class="i-carbon-notebook h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            <span class="text-xs truncate">全部笔记</span>
          </button>

          <!-- Folders toggle -->
          <div class="px-3 pt-2 pb-1">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-sidebar-foreground transition-colors"
                @click="showFolders = !showFolders"
              >
                <div class="i-carbon-chevron-right h-2.5 w-2.5 transition-transform duration-150" :class="{ 'rotate-90': showFolders }" />
                文件夹
              </button>
              <button
                class="p-0.5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                title="新建文件夹"
                @click="isCreatingFolder = true"
              >
                <div class="i-carbon-add text-sm" />
              </button>
            </div>
            <div v-if="isCreatingFolder" class="pt-1 pb-1">
              <input
                v-model="newFolderName"
                type="text"
                placeholder="文件夹名称"
                class="w-full h-6 px-2 rounded border border-sidebar-ring bg-transparent text-xs text-sidebar-foreground focus:outline-none"
                autofocus
                @keydown.enter="handleCreateFolder"
                @keydown.escape="cancelCreateFolder"
                @blur="cancelCreateFolder"
              >
            </div>
            <template v-if="showFolders && folderTree.length > 0">
              <button
                v-for="f in folderTree"
                :key="f.id"
                class="w-full flex items-center gap-2 px-3 py-1 text-xs transition-colors duration-100"
                :class="store.selectedFolderId === f.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'"
                @click="store.selectFolder(f.id)"
              >
                <div class="i-carbon-folder h-3.5 w-3.5 flex-shrink-0 opacity-60" />
                <span class="truncate">{{ f.name }}</span>
              </button>
            </template>
            <div v-else-if="showFolders && folderTree.length === 0" class="text-center px-3 pb-1.5 text-[10px] text-muted-foreground">
              暂无文件夹
            </div>
          </div>

          <!-- Tags toggle -->
          <div class="px-3 pt-1 pb-1.5">
            <button
              class="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-sidebar-foreground transition-colors"
              @click="showTags = !showTags"
            >
              <div class="i-carbon-chevron-right h-2.5 w-2.5 transition-transform duration-150" :class="{ 'rotate-90': showTags }" />
              标签
            </button>
            <template v-if="showTags && tagsList.length > 0">
              <button
                v-for="tag in tagsList"
                :key="tag.id"
                class="w-full flex items-center gap-2 py-1 text-xs transition-colors duration-100"
                :class="store.selectedTagId === tag.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'"
                @click="store.selectTag(tag.id)"
              >
                <div class="i-carbon-tag h-3 w-3 flex-shrink-0 opacity-50" />
                <span class="truncate">{{ tag.name }}</span>
                <span class="ml-auto text-[10px] text-muted-foreground/50">{{ tag.noteCount }}</span>
              </button>
            </template>
            <div v-else-if="showTags && tagsList.length === 0" class="text-center px-3 pb-1.5 text-[10px] text-muted-foreground">
              暂无标签
            </div>
          </div>
        </div>

        <!-- Note list -->
        <div class="flex-1 overflow-y-auto">
          <div v-if="isLoading" class="p-4 text-center text-xs text-muted-foreground">
            加载中...
          </div>
          <div v-else-if="notes.length === 0" class="p-6 text-center">
            <div class="i-carbon-document mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
            <p class="text-xs text-muted-foreground">
              暂无笔记
            </p>
            <button
              class="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border text-foreground hover:bg-sidebar-accent transition-colors"
              @click="handleCreateNote"
            >
              <div class="i-carbon-add h-3 w-3" />
              创建第一篇笔记
            </button>
          </div>
          <template v-else>
            <button
              v-for="note in notes"
              :key="note.id"
              class="w-full text-left px-3 py-2 border-b border-sidebar-border/50 transition-colors duration-100"
              :class="store.currentNoteId === note.id ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/40'"
              @click="handleSelectNote(note.id)"
            >
              <div class="text-sm font-medium text-foreground truncate">
                {{ note.title || '无标题' }}
              </div>
              <div class="mt-0.5 text-[11px] text-muted-foreground/60 line-clamp-2 leading-relaxed">
                {{ getPreview(note) }}
              </div>
              <div class="mt-1 flex items-center gap-1.5">
                <span class="text-[10px] text-muted-foreground/40">{{ formatDate(note.updatedAt) }}</span>
                <span
                  v-for="tag in note.tags.slice(0, 2)"
                  :key="tag.id"
                  class="text-[10px] px-1 py-px rounded bg-secondary text-secondary-foreground"
                >{{ tag.name }}</span>
              </div>
            </button>
          </template>
        </div>
      </aside>

      <!-- Resize handle -->
      <div
        class="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 hover:bg-border/50 transition-colors duration-150"
        :class="{ 'bg-primary/40': isResizing }"
        style="touch-action: none; user-select: none;"
        @mousedown="handleMouseDown"
      />
    </div>

    <!-- Main Editor Area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Status bar (only when note selected) -->
      <header v-if="currentNote" class="flex-shrink-0 border-b border-border bg-background px-4 py-1.5 flex items-center justify-between gap-1">
        <div class="flex items-center gap-1">
          <span v-if="store.isSaving" class="text-xs text-muted-foreground">保存中...</span>
          <span v-else-if="store.lastSavedAt" class="text-xs text-muted-foreground">
            已保存 {{ formatSaveTime(store.lastSavedAt) }}
          </span>
          <span v-else-if="currentNote?.updatedAt" class="text-xs text-muted-foreground">
            上次编辑于 {{ formatSaveTime(currentNote.updatedAt) }}
          </span>
          <span
            v-for="tag in (currentNote?.tags ?? [])"
            :key="tag.id"
            class="text-xs px-1.5 py-0.5 rounded-md bg-secondary text-secondary-foreground"
          >{{ tag.name }}</span>
        </div>
        <button
          class="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent/50 transition-colors"
          title="删除笔记"
          @click="handleDeleteNote"
        >
          <div class="i-carbon-trash-can h-4 w-4" />
        </button>
      </header>

      <!-- Editor -->
      <main v-if="currentNote" class="flex-1 flex flex-col min-h-0">
        <!-- Scrollable area: title + editor together -->
        <div class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto pt-10">
            <!-- Inline title (Notion-style) -->
            <input
              ref="titleInput"
              v-model="editTitle"
              class="w-full px-6 text-3xl font-bold text-foreground bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/40 mb-2"
              placeholder="无标题"
              @blur="saveTitle"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            >
          </div>
          <!-- ProseKit WYSIWYG Editor (key forces remount on note switch) -->
          <div class="max-w-3xl mx-auto">
            <NoteEditor
              :key="store.currentNoteId!"
              :editor-state="currentEditorState"
              :content="currentNote.content"
              @change="handleEditorChange"
            />
          </div>
        </div>
      </main>
      <main v-else class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <div class="i-carbon-notebook mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h2 class="text-lg font-medium text-muted-foreground mb-2">
            知识库
          </h2>
          <p class="text-sm text-muted-foreground/70 mb-4">
            选择一篇笔记开始编辑，或创建一篇新笔记
          </p>
          <button
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-accent transition-colors duration-150"
            @click="handleCreateNote"
          >
            <div class="i-carbon-add h-4 w-4" />
            新建笔记
          </button>
        </div>
      </main>
    </div>
  </div>
</template>
