<script setup lang="ts">
import type { NoteWithTags } from '@locus-agent/agent-sdk'
import type { TreeNode } from '@locus-agent/ui'
import type { TagTreeData } from '@/utils/tagTree'
import { useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as api from '@/api/knowledge'
import AddTagsModal from '@/components/knowledge/AddTagsModal.vue'
import MemoriesComposer from '@/components/knowledge/MemoriesComposer.vue'
import MemoriesTagSidebar from '@/components/knowledge/MemoriesTagSidebar.vue'
import MemoryNoteCard from '@/components/knowledge/MemoryNoteCard.vue'
import NoteEditor from '@/components/knowledge/NoteEditor.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import {
  useNotesListQuery,
  useSearchNotesQuery,
  useTagsQuery,
} from '@/composables/knowledgeQueries'
import { useMemoriesSidebar } from '@/composables/useMemoriesSidebar'
import { useNoteEditorSave } from '@/composables/useNoteEditorSave'
import { useKnowledgeStore } from '@/stores/knowledge'

const store = useKnowledgeStore()
const toast = useToast()
const queryCache = useQueryCache()
const route = useRoute()
const router = useRouter()
const { sidebarCollapsed, toggleSidebar } = useMemoriesSidebar()

const isSyncingFromUrl = ref(false)
const isSyncingToUrl = ref(false)

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

// ==================== Tag tree ====================

const activeTagPath = ref<string | null>(null)

function handleTagTreeSelect(node: TreeNode) {
  const data = node.data as TagTreeData
  if (data.tagId) {
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
    activeTagPath.value = activeTagPath.value === node.id ? null : node.id
    store.selectTag(null)
  }
}

function selectTag(tagId: string | null) {
  if (store.selectedTagId === tagId) {
    store.selectTag(null)
    activeTagPath.value = null
  }
  else {
    store.selectTag(tagId)
    const tag = tagsList.value.find(t => t.id === tagId)
    activeTagPath.value = tag?.name ?? null
  }
}

// ==================== Composer (create new note) ====================

const composerRef = ref<InstanceType<typeof MemoriesComposer> | null>(null)
const isPublishing = ref(false)

async function handlePublish(data: { editorState: Record<string, unknown>, content: string }) {
  if (!data.content?.trim() || isPublishing.value)
    return

  isPublishing.value = true
  try {
    const note = await api.createNote({
      content: data.content,
      editorState: data.editorState,
    })
    queryCache.setQueryData(['note', note.id], note)
    queryCache.invalidateQueries({ key: ['notes'] })
    composerRef.value?.reset()
    toast.success('已记录')
  }
  catch (e: unknown) {
    toast.error((e as { message?: string })?.message || '发布失败')
  }
  finally {
    isPublishing.value = false
  }
}

// ==================== Highlight & edit ====================

const highlightedNoteId = ref<string | null>(null)
const highlightedCardRef = ref<HTMLElement | null>(null)

onClickOutside(highlightedCardRef, () => {
  highlightedNoteId.value = null
})

const editingNoteId = ref<string | null>(null)
const editingNote = computed(() => {
  if (!editingNoteId.value)
    return null
  return notes.value.find(n => n.id === editingNoteId.value) ?? null
})

const {
  lastSavedText,
  handleChange: handleEditingEditorChange,
  reset: resetEditorSave,
} = useNoteEditorSave({
  getNoteId: () => editingNoteId.value,
  save: async (noteId, data) => {
    store.currentNoteId = noteId
    const updated = await store.saveCurrentNote({
      content: data.content,
      editorState: data.editorState,
    })
    store.currentNoteId = null
    return updated
  },
  onSaved: (noteId, updated) => {
    queryCache.setQueryData(['note', noteId], updated)
    queryCache.invalidateQueries({ key: ['notes'] })
  },
})

function startEditing(note: NoteWithTags) {
  highlightedNoteId.value = null
  editingNoteId.value = note.id
  resetEditorSave()
  isSyncingToUrl.value = true
  router.replace({
    name: 'memories',
    query: {
      ...(store.selectedTagId ? { tag: tagsList.value.find(t => t.id === store.selectedTagId)?.name } : {}),
      id: note.id,
    },
  })
  isSyncingToUrl.value = false
}

function cancelEditing() {
  editingNoteId.value = null
  resetEditorSave()
  isSyncingToUrl.value = true
  router.replace({
    name: 'memories',
    query: store.selectedTagId ? { tag: tagsList.value.find(t => t.id === store.selectedTagId)?.name } : {},
  })
  isSyncingToUrl.value = false
}

// ==================== Delete ====================

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

// ==================== Tags modal ====================

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

// ==================== URL query 与标签同步（tag 为 tag name，如 xxx/yyy）====================

function applyTagFromUrl(tagName: string | undefined) {
  if (!tagName) {
    store.selectTag(null)
    activeTagPath.value = null
    return
  }
  const tag = tagsList.value.find(t => t.name === tagName)
  if (!tag) {
    store.selectTag(null)
    activeTagPath.value = null
    return
  }
  store.selectTag(tag.id)
  activeTagPath.value = tag.name
}

watch(
  [() => route.query.tag as string | undefined, tagsList],
  ([tagName]) => {
    if (isSyncingToUrl.value)
      return
    const name = typeof tagName === 'string' ? tagName : undefined
    const tag = name ? tagsList.value.find(t => t.name === name) : null
    const expectedId = tag?.id ?? null
    if (name && !tag && tagsList.value.length === 0) {
      return
    }
    if (expectedId !== store.selectedTagId) {
      isSyncingFromUrl.value = true
      applyTagFromUrl(name)
      store.search('')
      isSyncingFromUrl.value = false
    }
  },
  { immediate: true },
)

watch(
  () => route.query.id as string | undefined,
  (idFromUrl) => {
    if (isSyncingToUrl.value)
      return
    if (idFromUrl)
      editingNoteId.value = idFromUrl
    else if (route.name === 'memories')
      editingNoteId.value = null
  },
  { immediate: true },
)

watch(
  () => store.selectedTagId,
  (newId) => {
    if (isSyncingFromUrl.value)
      return
    const tag = newId ? tagsList.value.find(t => t.id === newId) : null
    const tagName = tag?.name ?? null
    const urlTag = route.query.tag as string | undefined
    const urlId = route.query.id as string | undefined
    if (tagName !== urlTag || (editingNoteId.value ? editingNoteId.value !== urlId : !!urlId)) {
      isSyncingToUrl.value = true
      router.replace({
        name: 'memories',
        query: {
          ...(tagName ? { tag: tagName } : {}),
          ...(editingNoteId.value ? { id: editingNoteId.value } : {}),
        },
      })
      isSyncingToUrl.value = false
    }
  },
)

// ESC to cancel editing (only when not in modal)
onKeyStroke('Escape', () => {
  if (editingNoteId.value && !showAddTagsModal.value) {
    cancelEditing()
  }
})
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 flex min-w-0">
      <!-- Left sidebar: tags -->
      <aside
        class="flex-shrink-0 border-r border-border bg-sidebar-background flex flex-col h-full transition-[width] duration-200 overflow-hidden"
        :style="{ width: sidebarCollapsed ? '0px' : '208px' }"
        :class="sidebarCollapsed ? 'border-r-0' : ''"
      >
        <MemoriesTagSidebar
          :tags="tagsList"
          :selected-tag-id="store.selectedTagId"
          :active-tag-path="activeTagPath"
          :notes-count="notesList?.length ?? 0"
          @select-tag="selectTag"
          @tag-tree-select="handleTagTreeSelect"
        />
      </aside>

      <!-- Center: composer + card stream -->
      <div class="flex-1 flex flex-col min-w-0 h-full">
        <div class="flex-shrink-0 h-10 flex items-center px-3 border-b border-border/50 font-mono">
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
          <div class="max-w-4xl mx-auto px-4 py-6">
            <!-- Composer -->
            <MemoriesComposer
              ref="composerRef"
              @publish="handlePublish"
            >
              <template #actions="{ data, requestPublish }">
                <button
                  class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  :class="data?.content?.trim()
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'"
                  :disabled="!data?.content?.trim() || isPublishing"
                  @click="requestPublish()"
                >
                  <div v-if="isPublishing" class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin" />
                  <div v-else class="i-carbon-add" />
                  新建
                </button>
              </template>
            </MemoriesComposer>

            <!-- Editing area -->
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
                <div class="flex items-center gap-1">
                  <button
                    class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="管理标签"
                    @click="openTagsModal(editingNoteId!)"
                  >
                    <div class="i-carbon-tag h-3.5 w-3.5" />
                  </button>
                  <button
                    class="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
                    @click="cancelEditing"
                  >
                    完成
                  </button>
                </div>
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
                >
                  <MemoryNoteCard
                    :note="note"
                    :is-highlighted="highlightedNoteId === note.id"
                    @click="(n) => { highlightedNoteId = null; startEditing(n) }"
                    @open-tags="openTagsModal"
                    @delete="handleDeleteNote"
                  />
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
.composer-editor :deep(.note-editor-content) {
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  padding: 1rem 1.25rem 0.75rem;
  font-size: 0.875rem;
}

.composer-editor :deep(.flex-shrink-0.border-b) {
  border-color: transparent;
  background: transparent;
  padding-left: 0.75rem;
}

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
