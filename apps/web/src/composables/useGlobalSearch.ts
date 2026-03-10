import type { Conversation } from '@locus-agent/agent-sdk'
import type { CommandItem } from '@locus-agent/ui'
import { useDebounceFn } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchConversations } from '@/api/conversations'
import * as api from '@/api/knowledge'

export interface SearchCommandItemData {
  type: 'note' | 'tag' | 'conversation'
  noteId?: string
  tagId?: string
  tagName?: string
  conversationId?: string
  tags?: { id: string, name: string }[]
}

const showCommandPalette = ref(false)
const commandPaletteQuery = ref('')
const commandSearchResults = ref<CommandItem[]>([])
const isCommandSearching = ref(false)

export const commandGroups = [
  { key: 'memories', label: '记忆' },
  { key: 'tags', label: '标签' },
  { key: 'conversations', label: '对话' },
]

export function useGlobalSearch() {
  const router = useRouter()

  const debouncedCommandSearch = useDebounceFn(async (query: string) => {
    if (!query.trim()) {
      commandSearchResults.value = []
      isCommandSearching.value = false
      return
    }

    isCommandSearching.value = true
    try {
      const [memoryResults, conversationResults, tagsResult] = await Promise.all([
        api.searchNotes(query),
        fetchConversations(),
        api.fetchTags(),
      ])

      const items: CommandItem[] = []

      // Memories
      for (const note of memoryResults.slice(0, 8)) {
        const preview = note.content.length > 80
          ? `${note.content.slice(0, 80)}...`
          : note.content
        items.push({
          id: `note-${note.id}`,
          label: preview,
          icon: 'i-carbon-idea',
          group: 'memories',
          data: { type: 'note', noteId: note.id, tags: note.tags } satisfies SearchCommandItemData,
        })
      }

      // Tags matching query
      const q = query.toLowerCase()
      for (const tag of tagsResult.filter(t => t.name.toLowerCase().includes(q)).slice(0, 5)) {
        items.push({
          id: `tag-${tag.id}`,
          label: `#${tag.name}`,
          description: `${tag.noteCount} 条记忆`,
          icon: 'i-carbon-tag',
          group: 'tags',
          data: { type: 'tag', tagId: tag.id, tagName: tag.name } satisfies SearchCommandItemData,
        })
      }

      // Conversations matching query
      const filteredConvs = (conversationResults ?? [])
        .filter((c: Conversation) => c.title.toLowerCase().includes(q))
        .slice(0, 5)
      for (const conv of filteredConvs) {
        items.push({
          id: `conv-${conv.id}`,
          label: conv.title,
          icon: 'i-carbon-chat',
          group: 'conversations',
          data: { type: 'conversation', conversationId: conv.id } satisfies SearchCommandItemData,
        })
      }

      commandSearchResults.value = items
    }
    catch {
      commandSearchResults.value = []
    }
    finally {
      isCommandSearching.value = false
    }
  }, 300)

  function handleCommandSearch(query: string) {
    commandPaletteQuery.value = query
    debouncedCommandSearch(query)
  }

  function handleCommandSelect(item: CommandItem) {
    const data = item.data as SearchCommandItemData
    if (data.type === 'note' && data.noteId) {
      const firstTag = data.tags?.[0]
      const query = firstTag ? { tag: firstTag.name } : {}
      router.push({ name: 'memories', query })
    }
    else if (data.type === 'tag' && data.tagName) {
      router.push({ name: 'memories', query: { tag: data.tagName } })
    }
    else if (data.type === 'conversation' && data.conversationId) {
      router.push({ name: 'chat', query: { session: data.conversationId } })
    }
  }

  // Reset search results when palette closes
  watch(showCommandPalette, (open) => {
    if (!open) {
      commandSearchResults.value = []
      commandPaletteQuery.value = ''
    }
  })

  function openSearch() {
    showCommandPalette.value = true
  }

  return {
    showCommandPalette,
    commandPaletteQuery,
    commandSearchResults,
    isCommandSearching,
    commandGroups,
    handleCommandSearch,
    handleCommandSelect,
    openSearch,
  }
}
