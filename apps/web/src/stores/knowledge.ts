import type { Folder } from '@locus-agent/shared'
import { useDebounceFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api/knowledge'

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ==================== State（仅 UI 与选择状态）====================

  const currentNoteId = ref<string | null>(null)

  /** 当前选中的文件夹 ID（null = 全部笔记） */
  const selectedFolderId = ref<string | null>(null)
  /** 当前选中的标签 ID */
  const selectedTagId = ref<string | null>(null)

  const isSaving = ref(false)
  const lastSavedAt = ref<Date | null>(null)
  const searchQuery = ref('')

  // ==================== Actions =====================

  /** 选择文件夹过滤（仅改状态，数据由 useNotesListQuery 自动拉取） */
  function selectFolder(folderId: string | null) {
    selectedFolderId.value = folderId
    selectedTagId.value = null
  }

  /** 选择标签过滤（仅改状态，数据由 useNotesListQuery 自动拉取） */
  function selectTag(tagId: string | null) {
    selectedTagId.value = tagId
    selectedFolderId.value = null
  }

  /** 选择笔记（仅改状态，详情由 useNoteQuery 自动拉取） */
  function selectNote(id: string) {
    if (currentNoteId.value === id)
      return
    currentNoteId.value = id
    lastSavedAt.value = null
  }

  /** 创建新记忆（需在 mutation 后 invalidate notes，并用 setQueryData 填充缓存） */
  async function createNote(folderId?: string | null) {
    const note = await api.createNote({
      folderId: folderId ?? selectedFolderId.value,
    })
    currentNoteId.value = note.id
    return note
  }

  /** 保存当前记忆（返回更新后的 note，用于 setQueryData） */
  async function saveCurrentNote(data: {
    content?: string
    editorState?: Record<string, unknown> | null
    tagNames?: string[]
  }) {
    if (!currentNoteId.value)
      return null

    isSaving.value = true
    try {
      const updated = await api.updateNote(currentNoteId.value, data)
      lastSavedAt.value = new Date()
      return updated
    }
    finally {
      isSaving.value = false
    }
  }

  /** 防抖保存 */
  const debouncedSave = useDebounceFn(saveCurrentNote, 1000)

  /** 删除笔记（需在 mutation 后 invalidate） */
  async function removeNote(id: string) {
    await api.deleteNote(id)
    if (currentNoteId.value === id)
      currentNoteId.value = null
  }

  /** 创建文件夹（需在 mutation 后 invalidate folders） */
  async function createFolder(name: string, parentId?: string | null) {
    return api.createFolder({ name, parentId })
  }

  /** 删除文件夹（需在 mutation 后 invalidate） */
  async function removeFolder(id: string) {
    await api.deleteFolder(id)
    if (selectedFolderId.value === id) {
      selectedFolderId.value = null
    }
  }

  /** 搜索笔记（仅改状态，数据由 useSearchNotesQuery 自动拉取） */
  function search(query: string) {
    searchQuery.value = query
  }

  return {
    currentNoteId,
    selectedFolderId,
    selectedTagId,
    isSaving,
    lastSavedAt,
    searchQuery,
    selectFolder,
    selectTag,
    selectNote,
    createNote,
    saveCurrentNote,
    debouncedSave,
    removeNote,
    createFolder,
    removeFolder,
    search,
  }
})

// ==================== Helpers ====================

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
}

export function buildFolderTree(folders: Folder[], parentId: string | null): FolderTreeNode[] {
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(f => ({
      ...f,
      children: buildFolderTree(folders, f.id),
    }))
}
