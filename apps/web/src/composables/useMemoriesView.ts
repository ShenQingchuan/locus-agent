import type { NoteWithTags } from '@univedge/locus-agent-sdk'
import type { TreeNode } from '@univedge/locus-ui'
import type MemoriesComposer from '@/components/knowledge/MemoriesComposer.vue'
import type { TagTreeData } from '@/utils/tagTree'
import { useQueryCache } from '@pinia/colada'
import { useToast } from '@univedge/locus-ui'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as api from '@/api/knowledge'
import {
  useNotesListQuery,
  useSearchNotesQuery,
  useTagsQuery,
} from '@/composables/knowledgeQueries'
import { useMemoriesUrlSync } from '@/composables/memories/useMemoriesUrlSync'
import { useTagManager } from '@/composables/memories/useTagManager'
import { useMemoriesSidebar } from '@/composables/useMemoriesSidebar'
import { useNoteEditorSave } from '@/composables/useNoteEditorSave'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useWorkspaceStore } from '@/stores/workspace'
import { formatTimelineDate, formatTimelineYear } from '@/utils/date'

export type MemoryScope = 'all' | 'global' | 'workspace'

export interface MemoriesDateGroup {
  dateKey: string
  date: Date
  notes: NoteWithTags[]
}

export function useMemoriesView() {
  const store = useKnowledgeStore()
  const workspaceStore = useWorkspaceStore()
  const toast = useToast()
  const queryCache = useQueryCache()
  const router = useRouter()
  const { sidebarCollapsed, toggleSidebar } = useMemoriesSidebar()

  const memoryScope = ref<MemoryScope>('all')

  const workspaceQueryPath = computed<string | undefined>(() => {
    if (memoryScope.value === 'global')
      return 'global'
    if (memoryScope.value === 'workspace' && workspaceStore.currentWorkspacePath)
      return workspaceStore.currentWorkspacePath
    return undefined
  })

  const { data: allNotesList, isPending: isNotesLoading } = useNotesListQuery(
    computed(() => null),
    computed(() => null),
    workspaceQueryPath,
  )
  const { data: searchResults, isPending: isSearchLoading } = useSearchNotesQuery(
    computed(() => store.searchQuery),
  )
  const { data: tags } = useTagsQuery()

  const isLoading = computed(() =>
    store.searchQuery.trim() ? isSearchLoading.value : isNotesLoading.value,
  )
  const tagsList = computed(() => tags.value ?? [])

  // ==================== Tag tree ====================

  const activeTagPath = ref<string | null>(null)

  // Filter notes by selected tag or active tag path (prefix matching)
  const notes = computed(() => {
    if (store.searchQuery.trim())
      return searchResults.value ?? []

    const all = allNotesList.value ?? []

    // Filter by exact tag ID
    if (store.selectedTagId) {
      return all.filter(n => n.tags.some(t => t.id === store.selectedTagId))
    }

    // Filter by tag path prefix (for virtual parent nodes like "food" → matches "food/*")
    if (activeTagPath.value) {
      const prefix = activeTagPath.value
      return all.filter(n =>
        n.tags.some(t => t.name === prefix || t.name.startsWith(`${prefix}/`)),
      )
    }

    return all
  })

  const groupedNotes = computed<MemoriesDateGroup[]>(() => {
    const groups = new Map<string, NoteWithTags[]>()

    for (const note of notes.value) {
      const date = new Date(note.createdAt)
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

      if (!groups.has(dateKey)) {
        groups.set(dateKey, [])
      }
      groups.get(dateKey)!.push(note)
    }

    // Sort groups by date (newest first) and notes within each group by createdAt
    const sortedGroups: Array<[string, NoteWithTags[]]> = []
    for (const entry of groups.entries()) {
      sortedGroups.push(entry)
    }
    sortedGroups.sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())

    return sortedGroups.map(([dateKey, dayNotes]) => ({
      dateKey,
      date: new Date(dateKey),
      notes: dayNotes.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
  })

  function handleTagTreeSelect(node: TreeNode) {
    const data = node.data as TagTreeData
    const hasChildren = !!(node.children?.length)
    if (data.tagId && !hasChildren) {
      // Leaf tag: exact match by tag ID
      store.selectTag(data.tagId)
      activeTagPath.value = node.id
    }
    else {
      // Parent/group node: prefix match by path
      activeTagPath.value = node.id
      store.selectTag(null)
    }
  }

  function selectTag(tagId: string | null) {
    if (!tagId) {
      store.selectTag(null)
      activeTagPath.value = null
      return
    }
    store.selectTag(tagId)
    const tag = tagsList.value.find(t => t.id === tagId)
    activeTagPath.value = tag?.name ?? null
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
        workspacePath: memoryScope.value === 'workspace' && workspaceStore.currentWorkspacePath
          ? workspaceStore.currentWorkspacePath
          : null,
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

  const { isSyncingToUrl } = useMemoriesUrlSync(
    tagsList,
    computed(() => store.selectedTagId),
    selectTag,
    query => store.search(query),
    editingNoteId,
    (id) => { editingNoteId.value = id },
  )

  function startEditing(note: NoteWithTags) {
    highlightedNoteId.value = null
    editingNoteId.value = note.id
    resetEditorSave()
    isSyncingToUrl.value = true
    router.replace({
      name: 'MemoriesView',
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
      name: 'MemoriesView',
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

  // ==================== Scope: workspace → global ====================

  async function handleToGlobal(note: NoteWithTags) {
    try {
      const updated = await api.updateNote(note.id, { workspacePath: null })
      if (updated) {
        queryCache.setQueryData(['note', note.id], updated)
        queryCache.invalidateQueries({ key: ['notes'] })
        toast.success('已转为全局记忆')
      }
    }
    catch (e: unknown) {
      toast.error((e as { message?: string })?.message || '操作失败')
    }
  }

  // ==================== Tags modal ====================

  const {
    showAddTagsModal,
    addTagsNoteTags,
    openTagsModal,
    handleSaveTags,
    handleDeleteTags,
  } = useTagManager(
    notes,
    payload => store.saveCurrentNote(payload),
    queryCache,
    toast,
    computed(() => store.selectedTagId),
    activeTagPath,
    selectTag,
  )

  // ESC to cancel editing (only when not in modal)
  onKeyStroke('Escape', () => {
    if (editingNoteId.value && !showAddTagsModal.value) {
      cancelEditing()
    }
  })

  return {
    store,
    workspaceStore,
    sidebarCollapsed,
    toggleSidebar,
    memoryScope,
    allNotesList,
    tagsList,
    isLoading,
    notes,
    groupedNotes,
    formatTimelineDate,
    formatTimelineYear,
    activeTagPath,
    handleTagTreeSelect,
    selectTag,
    handleDeleteTags,
    composerRef,
    handlePublish,
    isPublishing,
    highlightedNoteId,
    highlightedCardRef,
    editingNoteId,
    handleEditingEditorChange,
    lastSavedText,
    startEditing,
    cancelEditing,
    handleDeleteNote,
    handleToGlobal,
    showAddTagsModal,
    addTagsNoteTags,
    openTagsModal,
    handleSaveTags,
  }
}
