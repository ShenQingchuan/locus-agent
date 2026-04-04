import type { ComputedRef, Ref } from 'vue'
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useMemoriesUrlSync(
  tagsList: ComputedRef<{ id: string, name: string }[]> | Ref<{ id: string, name: string }[]>,
  selectedTagId: ComputedRef<string | null> | Ref<string | null>,
  selectTag: (tagId: string | null) => void,
  search: (query: string) => void,
  editingNoteId: ComputedRef<string | null> | Ref<string | null>,
  setEditingNoteId: (id: string | null) => void,
) {
  const route = useRoute()
  const router = useRouter()

  const isSyncingFromUrl = { value: false }
  const isSyncingToUrl = { value: false }

  function applyTagFromUrl(tagName: string | undefined) {
    if (!tagName) {
      selectTag(null)
      return
    }
    const tag = tagsList.value.find(t => t.name === tagName)
    if (!tag) {
      selectTag(null)
      return
    }
    selectTag(tag.id)
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
      if (expectedId !== selectedTagId.value) {
        isSyncingFromUrl.value = true
        applyTagFromUrl(name)
        search('')
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
        setEditingNoteId(idFromUrl)
      else if (route.name === 'memories')
        setEditingNoteId(null)
    },
    { immediate: true },
  )

  watch(
    selectedTagId,
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

  return {
    isSyncingFromUrl,
    isSyncingToUrl,
  }
}
