import type { MaybeRef } from 'vue'
import type { WorkspaceMentionItem } from './types'
import { ref, toValue } from 'vue'
import { fetchMentionSearch } from '@/api/workspace'

export function usePathMenuItems(workspaceRoot?: MaybeRef<string | undefined>) {
  const items = ref<WorkspaceMentionItem[]>([])
  const isLoading = ref(false)
  const isTruncated = ref(false)

  async function search(query: string) {
    isLoading.value = true
    try {
      const basePath = toValue(workspaceRoot) || undefined
      const res = await fetchMentionSearch(query, basePath)
      isTruncated.value = res.truncated

      items.value = res.entries.map((entry) => {
        const isDir = entry.type === 'directory'
        const displayPath = query.startsWith('/')
          ? entry.absolutePath
          : entry.relativePath

        return {
          id: entry.absolutePath,
          label: entry.name,
          searchText: displayPath,
          absolutePath: entry.absolutePath,
          displayPath: isDir ? `${displayPath}/` : displayPath,
          kind: isDir ? 'dir-mention' as const : 'file-mention' as const,
          icon: isDir ? 'i-carbon-folder' : 'i-carbon-document',
        }
      })
    }
    catch {
      items.value = []
      isTruncated.value = false
    }
    finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, isTruncated, search }
}
