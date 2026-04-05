import type {
  CreateFolderInput,
  CreateNoteInput,
  Folder,
  ListFoldersResponse,
  ListNotesResponse,
  ListTagsResponse,
  MemoryStats,
  NoteWithTags,
  SearchNotesResponse,
  Tag,
  TagWithCount,
  UpdateFolderInput,
  UpdateNoteInput,
} from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

const API_BASE = '/api'

// ==================== Notes ====================

export async function fetchNotes(params?: {
  folderId?: string | null
  tagId?: string
  /** 'global' = 仅全局, 路径字符串 = 仅该工作空间, undefined = 不过滤 */
  workspacePath?: string
  limit?: number
  offset?: number
}): Promise<NoteWithTags[]> {
  const searchParams = new URLSearchParams()
  if (params?.folderId != null)
    searchParams.set('folderId', params.folderId)
  if (params?.tagId)
    searchParams.set('tagId', params.tagId)
  if (params?.workspacePath)
    searchParams.set('workspacePath', params.workspacePath)
  if (params?.limit)
    searchParams.set('limit', String(params.limit))
  if (params?.offset)
    searchParams.set('offset', String(params.offset))

  const query = searchParams.toString()
  const { notes } = await apiClient.get<ListNotesResponse>(`${API_BASE}/notes${query ? `?${query}` : ''}`)
  return notes
}

export async function fetchNote(id: string): Promise<NoteWithTags> {
  return apiClient.get<NoteWithTags>(`${API_BASE}/notes/${id}`)
}

export async function createNote(input: CreateNoteInput): Promise<NoteWithTags> {
  return apiClient.post<NoteWithTags>(`${API_BASE}/notes`, input)
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<NoteWithTags> {
  return apiClient.patch<NoteWithTags>(`${API_BASE}/notes/${id}`, input)
}

export async function deleteNote(id: string): Promise<void> {
  await apiClient.del(`${API_BASE}/notes/${id}`)
}

export async function searchNotes(query: string): Promise<NoteWithTags[]> {
  const { notes } = await apiClient.get<SearchNotesResponse>(`${API_BASE}/notes/search?q=${encodeURIComponent(query)}`)
  return notes
}

export async function searchByTags(tagNames: string[]): Promise<NoteWithTags[]> {
  const { notes } = await apiClient.post<SearchNotesResponse>(`${API_BASE}/notes/search-by-tags`, { tags: tagNames })
  return notes
}

export async function fetchMemoryStats(): Promise<MemoryStats> {
  return apiClient.get<MemoryStats>(`${API_BASE}/notes/stats`)
}

// ==================== Folders ====================

export async function fetchFolders(): Promise<Folder[]> {
  const { folders } = await apiClient.get<ListFoldersResponse>(`${API_BASE}/folders`)
  return folders
}

export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  return apiClient.post<Folder>(`${API_BASE}/folders`, input)
}

export async function updateFolder(id: string, input: UpdateFolderInput): Promise<Folder> {
  return apiClient.patch<Folder>(`${API_BASE}/folders/${id}`, input)
}

export async function deleteFolder(id: string): Promise<void> {
  await apiClient.del(`${API_BASE}/folders/${id}`)
}

// ==================== Tags ====================

export async function fetchTags(): Promise<TagWithCount[]> {
  const { tags } = await apiClient.get<ListTagsResponse>(`${API_BASE}/tags`)
  return tags
}

export async function createTag(name: string) {
  return apiClient.post<Tag>(`${API_BASE}/tags`, { name })
}

export async function renameTag(id: string, name: string): Promise<void> {
  await apiClient.patch(`${API_BASE}/tags/${id}`, { name })
}

export async function deleteTag(id: string): Promise<void> {
  await apiClient.del(`${API_BASE}/tags/${id}`)
}
