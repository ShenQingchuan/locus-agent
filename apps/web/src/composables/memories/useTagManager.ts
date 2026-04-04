import type { useQueryCache } from '@pinia/colada'
import type { NoteWithTags } from '@univedge/locus-agent-sdk'
import type { useToast } from '@univedge/locus-ui'
import { computed, ref } from 'vue'
import * as api from '@/api/knowledge'

type QueryCache = ReturnType<typeof useQueryCache>
type ToastApi = ReturnType<typeof useToast>

export function useTagManager(
  notes: { value: NoteWithTags[] },
  saveCurrentNote: (payload: { tagNames?: string[] }) => Promise<NoteWithTags | null | undefined>,
  queryCache: QueryCache,
  toast: ToastApi,
  selectedTagId: { value: string | null },
  activeTagPath: { value: string | null },
  selectTag: (tagId: string | null) => void,
) {
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
    const updated = await saveCurrentNote({ tagNames })
    if (updated) {
      queryCache.setQueryData(['note', addTagsNoteId.value], updated)
      queryCache.invalidateQueries({ key: ['notes'] })
      queryCache.invalidateQueries({ key: ['tags'] })
    }
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
        if (selectedTagId.value && tagIds.includes(selectedTagId.value)) {
          selectTag(null)
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

  return {
    showAddTagsModal,
    addTagsNoteTags,
    openTagsModal,
    handleSaveTags,
    handleDeleteTags,
  }
}
