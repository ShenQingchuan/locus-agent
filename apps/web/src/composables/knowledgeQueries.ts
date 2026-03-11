import type { ComputedRef, Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import * as api from '@/api/knowledge'

const STALE_TIME = 30_000 // 30s 内相同 key 不重复请求

/**
 * 笔记列表查询（按 folder/tag/workspace 过滤，带缓存）
 */
export function useNotesListQuery(
  folderId: ComputedRef<string | null>,
  tagId: ComputedRef<string | null>,
  workspacePath?: ComputedRef<string | undefined>,
) {
  return useQuery({
    key: () => ['notes', folderId.value, tagId.value, workspacePath?.value ?? null],
    query: () => api.fetchNotes({
      folderId: folderId.value,
      tagId: tagId.value ?? undefined,
      workspacePath: workspacePath?.value,
    }),
    staleTime: STALE_TIME,
  })
}

/**
 * 文件夹列表查询（带缓存）
 */
export function useFoldersQuery() {
  return useQuery({
    key: ['folders'],
    query: api.fetchFolders,
    staleTime: STALE_TIME,
  })
}

/**
 * 标签列表查询（带缓存）
 */
export function useTagsQuery() {
  return useQuery({
    key: ['tags'],
    query: api.fetchTags,
    staleTime: STALE_TIME,
  })
}

/**
 * 单篇笔记详情查询（带缓存）
 */
export function useNoteQuery(noteId: ComputedRef<string | null>) {
  return useQuery({
    key: () => ['note', noteId.value!],
    query: () => api.fetchNote(noteId.value!),
    staleTime: STALE_TIME,
    enabled: () => !!noteId.value,
  })
}

/**
 * 搜索笔记查询（带缓存，相同关键词复用）
 */
export function useSearchNotesQuery(searchQuery: ComputedRef<string>) {
  return useQuery({
    key: () => ['notes', 'search', searchQuery.value],
    query: () => api.searchNotes(searchQuery.value),
    staleTime: STALE_TIME,
    enabled: () => searchQuery.value.trim().length > 0,
  })
}

/**
 * 记忆统计查询
 */
export function useMemoryStatsQuery() {
  return useQuery({
    key: ['notes', 'stats'],
    query: api.fetchMemoryStats,
    staleTime: STALE_TIME,
  })
}

/**
 * 按标签名搜索记忆（按需触发）
 */
export function useSearchByTagsQuery(tagNames: Ref<string[]>) {
  return useQuery({
    key: () => ['notes', 'search-by-tags', ...tagNames.value],
    query: () => api.searchByTags(tagNames.value),
    staleTime: STALE_TIME,
    enabled: () => tagNames.value.length > 0,
  })
}
