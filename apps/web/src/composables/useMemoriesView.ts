import type { NoteWithTags } from '@univedge/locus-agent-sdk'
import type { TreeNode } from '@univedge/locus-ui'
import type MemoriesComposer from '@/components/knowledge/MemoriesComposer.vue'
import type { TagTreeData } from '@/utils/tagTree'
import { useQueryCache } from '@pinia/colada'
import { useToast } from '@univedge/locus-ui'
import { onClickOutside, onKeyStroke } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as api from '@/api/knowledge'
import {
  useNotesListQuery,
  useSearchNotesQuery,
  useTagsQuery,
} from '@/composables/knowledgeQueries'
import { useMemoriesSidebar } from '@/composables/useMemoriesSidebar'
import { useNoteEditorSave } from '@/composables/useNoteEditorSave'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useWorkspaceStore } from '@/stores/workspace'

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
  const route = useRoute()
  const router = useRouter()
  const { sidebarCollapsed, toggleSidebar } = useMemoriesSidebar()

  const isSyncingFromUrl = ref(false)
  const isSyncingToUrl = ref(false)
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

  function formatTimelineDate(date: Date): string {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (dateStart.getTime() === today.getTime()) {
      return '今天'
    }
    if (dateStart.getTime() === yesterday.getTime()) {
      return '昨天'
    }

    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  function formatTimelineYear(date: Date): string {
    const now = new Date()
    if (date.getFullYear() !== now.getFullYear()) {
      return `${date.getFullYear()}年`
    }
    return ''
  }

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

  async function handleDeleteTags(tagIds: string[], groupName: string) {
    const isSingle = tagIds.length === 1
    const message = isSingle
      ? `确定要删除标签「${groupName}」吗？标签会从所有记忆中移除，但记忆本身不会被删除。`
      : `确定要删除「${groupName}」下的 ${tagIds.length} 个标签吗？标签会从所有记忆中移除，但记忆本身不会被删除。`

    const confirmed = await toast.confirm({
      title: isSingle ? '删除标签' : '删除标签分组',
      message,
      confirmText: '删除',
      cancelText: '取消',
      type: 'error',
    })
    if (confirmed) {
      try {
        await Promise.all(tagIds.map(id => api.deleteTag(id)))
        if (store.selectedTagId && tagIds.includes(store.selectedTagId)) {
          store.selectTag(null)
          activeTagPath.value = null
        }
        queryCache.invalidateQueries({ key: ['tags'] })
        queryCache.invalidateQueries({ key: ['notes'] })
        toast.success(isSingle ? '标签已删除' : `已删除 ${tagIds.length} 个标签`)
      }
      catch (e: unknown) {
        toast.error((e as { message?: string })?.message || '删除标签失败')
      }
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
          name: 'MemoriesView',
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
