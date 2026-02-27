<script setup lang="ts">
import type { NoteWithTags } from '@locus-agent/shared'
import type { TreeNode } from '@locus-agent/ui'
import type { TagTreeData } from '@/utils/tagTree'
import { Tree, useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { onClickOutside, useDebounceFn } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import * as api from '@/api/knowledge'
import AppNavRail from '@/components/AppNavRail.vue'
import AddTagsModal from '@/components/knowledge/AddTagsModal.vue'
import NoteEditor from '@/components/knowledge/NoteEditor.vue'
import {
  useNotesListQuery,
  useSearchNotesQuery,
  useTagsQuery,
} from '@/composables/knowledgeQueries'
import { useGlobalSearch } from '@/composables/useGlobalSearch'
import { useKnowledgeStore } from '@/stores/knowledge'
import { buildTagTree } from '@/utils/tagTree'

const store = useKnowledgeStore()
const toast = useToast()
const queryCache = useQueryCache()
const { pendingHighlightNoteId, pendingTagSelection } = useGlobalSearch()

const selectedTagId = computed(() => store.selectedTagId)

const { data: notesList, isPending: isNotesLoading } = useNotesListQuery(
  computed(() => null),
  selectedTagId,
)
const { data: searchResults, isPending: isSearchLoading } = useSearchNotesQuery(
  computed(() => store.searchQuery),
)
const { data: tags } = useTagsQuery()

const notes = computed(() => {
  if (store.searchQuery.trim())
    return searchResults.value ?? []
  return notesList.value ?? []
})
const isLoading = computed(() =>
  store.searchQuery.trim() ? isSearchLoading.value : isNotesLoading.value,
)
const tagsList = computed(() => tags.value ?? [])

// ==================== 标签树 ====================

const tagTree = computed(() => buildTagTree(tagsList.value))

/**
 * IDs of tree nodes to expand by default.
 * Expand all root-level nodes that have children.
 */
const defaultExpandedTagIds = computed(() =>
  tagTree.value
    .filter(n => n.children && n.children.length > 0)
    .map(n => n.id),
)

/** Active tag's full path (tree node ID) for highlighting */
const activeTagPath = ref<string | null>(null)

function handleTagTreeSelect(node: TreeNode) {
  const data = node.data as TagTreeData
  if (data.tagId) {
    // Leaf node with a real tag — toggle filter
    if (store.selectedTagId === data.tagId) {
      store.selectTag(null)
      activeTagPath.value = null
    }
    else {
      store.selectTag(data.tagId)
      activeTagPath.value = node.id
    }
  }
  else {
    // Virtual parent node — find the first real descendant tag to filter on,
    // or just clear
    activeTagPath.value = activeTagPath.value === node.id ? null : node.id
    store.selectTag(null)
  }
}

// ==================== 侧边栏收起 ====================

const sidebarCollapsed = ref(
  localStorage.getItem('memories-sidebar-collapsed') === 'true',
)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('memories-sidebar-collapsed', String(sidebarCollapsed.value))
}

// ==================== 输入区（Composer）====================

const composerKey = ref(0)
const composerData = ref<{ editorState: Record<string, unknown>, content: string } | null>(null)
const isPublishing = ref(false)

function handleComposerChange(data: { editorState: Record<string, unknown>, content: string }) {
  composerData.value = data
}

async function handlePublish() {
  if (!composerData.value?.content?.trim() || isPublishing.value)
    return

  isPublishing.value = true
  try {
    const note = await api.createNote({
      content: composerData.value.content,
      editorState: composerData.value.editorState,
    })
    queryCache.setQueryData(['note', note.id], note)
    queryCache.invalidateQueries({ key: ['notes'] })
    // 重置编辑器
    composerData.value = null
    composerKey.value++
    toast.success('已记录')
  }
  catch (e: any) {
    toast.error(e?.message || '发布失败')
  }
  finally {
    isPublishing.value = false
  }
}

// ==================== 高亮记忆卡片 ====================

const highlightedNoteId = ref<string | null>(null)
const highlightedCardRef = ref<HTMLElement | null>(null)

onClickOutside(highlightedCardRef, () => {
  highlightedNoteId.value = null
})

// ==================== 卡片编辑 ====================

const editingNoteId = ref<string | null>(null)
const editingData = ref<{ editorState: Record<string, unknown>, content: string } | null>(null)
const editingNote = computed(() => {
  if (!editingNoteId.value)
    return null
  return notes.value.find(n => n.id === editingNoteId.value) ?? null
})
const lastSavedAt = ref<Date | null>(null)

const lastSavedText = computed(() => {
  if (!lastSavedAt.value)
    return ''
  const d = lastSavedAt.value
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss} 已保存`
})

function startEditing(note: NoteWithTags) {
  highlightedNoteId.value = null
  editingNoteId.value = note.id
  editingData.value = null
  lastSavedAt.value = null
}

function cancelEditing() {
  editingNoteId.value = null
  editingData.value = null
  lastSavedAt.value = null
}

interface EditSaveTask {
  changeId: number
  noteId: string
  data: { editorState: Record<string, unknown>, content: string }
}

let latestEditChangeId = 0
let isEditSaveQueueRunning = false
let pendingEditSaveTask: EditSaveTask | null = null

async function runEditSaveQueue() {
  if (isEditSaveQueueRunning)
    return

  isEditSaveQueueRunning = true
  try {
    while (pendingEditSaveTask) {
      const task = pendingEditSaveTask
      pendingEditSaveTask = null

      if (task.changeId !== latestEditChangeId || task.noteId !== editingNoteId.value)
        continue

      store.currentNoteId = task.noteId
      const updated = await store.saveCurrentNote({
        content: task.data.content,
        editorState: task.data.editorState,
      })
      store.currentNoteId = null

      if (!updated || task.changeId !== latestEditChangeId)
        continue

      queryCache.setQueryData(['note', task.noteId], updated)
      queryCache.invalidateQueries({ key: ['notes'] })
      lastSavedAt.value = new Date()
    }
  }
  finally {
    isEditSaveQueueRunning = false
    if (pendingEditSaveTask)
      void runEditSaveQueue()
  }
}

function enqueueEditSave(task: EditSaveTask) {
  pendingEditSaveTask = task
  void runEditSaveQueue()
}

const debouncedEditSave = useDebounceFn((task: EditSaveTask) => {
  enqueueEditSave(task)
}, 1000)

function handleEditingEditorChange(data: { editorState: Record<string, unknown>, content: string }) {
  editingData.value = data
  if (!editingNoteId.value)
    return

  const task: EditSaveTask = {
    changeId: ++latestEditChangeId,
    noteId: editingNoteId.value,
    data,
  }
  debouncedEditSave(task)
}

// ==================== 删除 ====================

async function handleDeleteNote(noteId: string) {
  const confirmed = await toast.confirm({
    title: '删除记忆',
    message: '确定要删除这条记忆吗？删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    type: 'error',
  })
  if (confirmed) {
    if (editingNoteId.value === noteId)
      cancelEditing()
    await store.removeNote(noteId)
    queryCache.invalidateQueries({ key: ['notes'] })
    queryCache.invalidateQueries({ key: ['note', noteId], exact: true })
    toast.success('记忆已删除')
  }
}

// ==================== 标签管理 ====================

const showAddTagsModal = ref(false)
const addTagsNoteId = ref<string | null>(null)
const addTagsNoteTags = computed(() => {
  if (!addTagsNoteId.value)
    return []
  const note = notes.value.find(n => n.id === addTagsNoteId.value)
  return note?.tags ?? []
})

function openTagsModal(noteId: string) {
  addTagsNoteId.value = noteId
  showAddTagsModal.value = true
}

async function handleSaveTags(tagNames: string[]) {
  if (!addTagsNoteId.value)
    return
  store.currentNoteId = addTagsNoteId.value
  const updated = await store.saveCurrentNote({ tagNames })
  store.currentNoteId = null
  if (updated) {
    queryCache.setQueryData(['note', addTagsNoteId.value], updated)
    queryCache.invalidateQueries({ key: ['notes'] })
    queryCache.invalidateQueries({ key: ['tags'] })
  }
}

// ==================== 全局搜索 → 本页响应 ====================

// When a note is selected from global search, highlight it
watch(pendingHighlightNoteId, (noteId) => {
  if (!noteId)
    return
  // Clear filters so the note is visible in the stream
  store.search('')
  store.selectTag(null)
  activeTagPath.value = null
  highlightedNoteId.value = noteId
  nextTick(() => {
    const el = document.querySelector(`[data-note-id="${noteId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Consume the signal
    pendingHighlightNoteId.value = null
  })
})

// When a tag is selected from global search, filter by it
watch(pendingTagSelection, (sel) => {
  if (!sel)
    return
  store.selectTag(sel.tagId)
  activeTagPath.value = sel.tagName
  store.search('')
  // Consume the signal
  pendingTagSelection.value = null
})

// ==================== 标签过滤 ====================

function selectTag(tagId: string | null) {
  if (store.selectedTagId === tagId) {
    store.selectTag(null)
    activeTagPath.value = null
  }
  else {
    store.selectTag(tagId)
    // Find the tag's path for tree highlighting
    const tag = tagsList.value.find(t => t.id === tagId)
    activeTagPath.value = tag?.name ?? null
  }
}

// ==================== 工具函数 ====================

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

  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear) {
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  }
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Convert ProseKit editor state JSON back to a plain-text preview (first ~120 chars).
 */
function getPreviewText(note: NoteWithTags): string {
  const text = note.content || ''
  if (text.length <= 120)
    return text
  return `${text.slice(0, 120)}...`
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <!-- App Navigation Rail -->
    <AppNavRail />

    <!-- Main content area -->
    <div class="flex-1 flex min-w-0">
      <!-- Left sidebar: tags (collapsible) -->
      <aside
        class="flex-shrink-0 border-r border-border bg-sidebar-background flex flex-col h-full transition-[width] duration-200 overflow-hidden"
        :style="{ width: sidebarCollapsed ? '0px' : '208px' }"
        :class="sidebarCollapsed ? 'border-r-0' : ''"
      >
        <div class="w-52 h-full flex flex-col">
          <!-- All memories button -->
          <div class="px-2 pt-2">
            <button
              class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="!store.selectedTagId && !activeTagPath
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-foreground hover:bg-accent/50'"
              @click="selectTag(null)"
            >
              <div class="i-carbon-notebook h-4 w-4 opacity-60" />
              <span>全部记忆</span>
              <span class="ml-auto text-xs text-muted-foreground">{{ notesList?.length ?? 0 }}</span>
            </button>
          </div>

          <!-- Tag tree -->
          <div class="flex-1 overflow-hidden px-2 pt-3 pb-2 flex flex-col">
            <div class="px-3 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              标签
            </div>
            <template v-if="tagTree.length > 0">
              <div class="flex-1 overflow-y-auto">
                <Tree
                  :nodes="tagTree"
                  :item-height="30"
                  :indent="12"
                  :default-expanded="defaultExpandedTagIds"
                  container-class="h-full"
                  @select="handleTagTreeSelect"
                >
                  <template #default="{ node, hasChildren }">
                    <div
                      class="flex items-center gap-1.5 flex-1 min-w-0 py-0.5 px-1 rounded text-sm transition-colors"
                      :class="activeTagPath === node.id || store.selectedTagId === (node.data as TagTreeData).tagId
                        ? 'text-accent-foreground font-medium'
                        : 'text-foreground'"
                    >
                      <div
                        class="h-3.5 w-3.5 opacity-50 flex-shrink-0"
                        :class="hasChildren ? 'i-carbon-folder' : 'i-carbon-tag'"
                      />
                      <span class="truncate">{{ node.label }}</span>
                      <span class="ml-auto text-[11px] text-muted-foreground/60 flex-shrink-0">
                        {{ (node.data as TagTreeData).noteCount }}
                      </span>
                    </div>
                  </template>
                </Tree>
              </div>
            </template>
            <div v-else class="px-3 py-4 text-xs text-muted-foreground/60 text-center">
              暂无标签
            </div>
          </div>
        </div>
      </aside>

      <!-- Center: composer + card stream -->
      <div class="flex-1 flex flex-col min-w-0 h-full">
        <!-- Toggle sidebar button -->
        <div class="flex-shrink-0 h-10 flex items-center px-3 border-b border-border/50">
          <button
            class="flex-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            :title="sidebarCollapsed ? '展开侧栏' : '收起侧栏'"
            @click="toggleSidebar"
          >
            <div
              class="h-4 w-4 transition-transform duration-200"
              :class="sidebarCollapsed ? 'i-carbon-side-panel-open' : 'i-carbon-side-panel-close'"
            />
          </button>
          <span v-if="store.selectedTagId || activeTagPath" class="ml-2 text-xs text-muted-foreground">
            #{{ store.selectedTagId ? tagsList.find(t => t.id === store.selectedTagId)?.name : activeTagPath }}
          </span>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div class="max-w-3xl mx-auto px-4 py-6">
            <!-- Composer: input area (Flomo-style) -->
            <div class="mb-8 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div class="composer-editor">
                <NoteEditor
                  :key="composerKey"
                  @change="handleComposerChange"
                />
              </div>
              <div class="flex items-center justify-between px-2 py-2.5 border-t border-border/50 bg-muted/30">
                <div class="text-xs text-muted-foreground/60">
                  支持 Markdown 语法
                </div>
                <button
                  class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="composerData?.content?.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'"
                  :disabled="!composerData?.content?.trim() || isPublishing"
                  @click="handlePublish"
                >
                  <div v-if="isPublishing" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin" />
                  <div v-else class="i-carbon-add" />
                  新建
                </button>
              </div>
            </div>

            <!-- Editing area (outside masonry flow) -->
            <div
              v-if="editingNoteId && editingNote"
              class="mb-6 rounded-lg border border-border/80 bg-card shadow-sm overflow-hidden"
            >
              <div class="editing-editor">
                <NoteEditor
                  :key="`edit-${editingNoteId}`"
                  :editor-state="editingNote.editorState ?? null"
                  :content="editingNote.content"
                  @change="handleEditingEditorChange"
                />
              </div>
              <div class="flex items-center justify-between px-3 py-1.5 border-t border-border/50 bg-muted/20">
                <span class="text-xs text-muted-foreground/60">
                  {{ store.isSaving ? '保存中...' : lastSavedText || '编辑中' }}
                </span>
                <button
                  class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                  @click="cancelEditing"
                >
                  完成
                </button>
              </div>
            </div>

            <!-- Card stream -->
            <div v-if="isLoading" class="py-12 text-center text-sm text-muted-foreground">
              <div class="i-carbon-circle-dash h-5 w-5 animate-spin mx-auto mb-2 opacity-50" />
              加载中...
            </div>

            <div v-else-if="notes.length === 0" class="py-16 text-center">
              <div class="i-carbon-idea mx-auto h-10 w-10 text-muted-foreground/30 mb-4" />
              <p class="text-sm text-muted-foreground/70">
                {{ store.searchQuery ? '没有找到匹配的记忆' : '还没有记忆，写下你的第一个想法吧' }}
              </p>
            </div>

            <div v-else class="columns-2 gap-3">
              <div
                v-for="note in notes"
                :key="note.id"
                :data-note-id="note.id"
                class="break-inside-avoid mb-3"
                :class="editingNoteId === note.id ? 'hidden' : ''"
              >
                <div
                  :ref="(el) => { if (highlightedNoteId === note.id) highlightedCardRef = el as HTMLElement }"
                  class="group rounded-lg border transition-all cursor-pointer"
                  :class="highlightedNoteId === note.id
                    ? 'border-primary/20 bg-primary/5 shadow-sm ring-0.5 ring-primary/10'
                    : 'border-border/60 bg-card hover:border-border hover:shadow-sm'"
                  @click="() => { highlightedNoteId = null; startEditing(note) }"
                >
                  <div class="px-3 pt-3 pb-2">
                    <div class="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap break-words line-clamp-8">
                      {{ getPreviewText(note) }}
                    </div>
                  </div>
                  <div class="px-3 pb-2.5 flex items-center justify-between gap-1">
                    <div class="flex items-center gap-1.5 min-w-0 overflow-hidden">
                      <span class="text-[11px] text-muted-foreground/50 flex-shrink-0">{{ formatDate(note.updatedAt) }}</span>
                      <span
                        v-for="tag in note.tags.slice(0, 2)"
                        :key="tag.id"
                        class="text-[11px] px-1 py-px rounded bg-secondary/50 text-secondary-foreground/70 truncate"
                      >
                        #{{ tag.name }}
                      </span>
                      <span v-if="note.tags.length > 2" class="text-[11px] text-muted-foreground/40">
                        +{{ note.tags.length - 2 }}
                      </span>
                    </div>
                    <div class="flex items-center gap-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="标签"
                        @click.stop="openTagsModal(note.id)"
                      >
                        <div class="i-carbon-tag h-3 w-3" />
                      </button>
                      <button
                        class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                        title="删除"
                        @click.stop="handleDeleteNote(note.id)"
                      >
                        <div class="i-carbon-trash-can h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <AddTagsModal
      :open="showAddTagsModal"
      :note-tags="addTagsNoteTags"
      :all-tags="tagsList"
      @save="handleSaveTags"
      @close="showAddTagsModal = false"
    />
  </div>
</template>

<style scoped>
/* Composer editor */
.composer-editor :deep(.note-editor-content) {
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  padding: 1rem 1.25rem 0.75rem;
  font-size: 0.875rem;
}

/* Hide toolbar border in composer to feel more integrated */
.composer-editor :deep(.flex-shrink-0.border-b) {
  border-color: transparent;
  background: transparent;
  padding-left: 0.75rem;
}

/* Editing editor in cards */
.editing-editor :deep(.note-editor-content) {
  min-height: 80px;
  max-height: 360px;
  overflow-y: auto;
  padding: 0.75rem 1rem 0.5rem;
  font-size: 0.8125rem;
}

.editing-editor :deep(.flex-shrink-0.border-b) {
  border-color: transparent;
  background: transparent;
  padding-left: 0.5rem;
}

/* Smaller headings inside memories editors */
.composer-editor :deep(.note-editor-content h1),
.editing-editor :deep(.note-editor-content h1) {
  font-size: 1.25rem;
}

.composer-editor :deep(.note-editor-content h2),
.editing-editor :deep(.note-editor-content h2) {
  font-size: 1.1rem;
}

.composer-editor :deep(.note-editor-content h3),
.editing-editor :deep(.note-editor-content h3) {
  font-size: 1rem;
}

.composer-editor :deep(.note-editor-content h4),
.editing-editor :deep(.note-editor-content h4) {
  font-size: 0.9375rem;
}
</style>
