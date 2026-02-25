import type {
  BacklinksResponse,
  CreateFolderInput,
  CreateNoteInput,
  Folder,
  ListFoldersResponse,
  ListNotesResponse,
  ListTagsResponse,
  NoteWithTags,
  SearchNotesResponse,
  Tag,
  TagWithCount,
  UpdateFolderInput,
  UpdateNoteInput,
} from '@locus-agent/shared'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ==================== Notes ====================

export async function fetchNotes(params?: {
  folderId?: string | null
  tagId?: string
  limit?: number
  offset?: number
}): Promise<NoteWithTags[]> {
  const searchParams = new URLSearchParams()
  if (params?.folderId != null)
    searchParams.set('folderId', params.folderId)
  if (params?.tagId)
    searchParams.set('tagId', params.tagId)
  if (params?.limit)
    searchParams.set('limit', String(params.limit))
  if (params?.offset)
    searchParams.set('offset', String(params.offset))

  const query = searchParams.toString()
  const { notes } = await request<ListNotesResponse>(`/notes${query ? `?${query}` : ''}`)
  return notes
}

export async function fetchNote(id: string): Promise<NoteWithTags> {
  return request<NoteWithTags>(`/notes/${id}`)
}

export async function createNote(input: CreateNoteInput): Promise<NoteWithTags> {
  return request<NoteWithTags>('/notes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateNote(id: string, input: UpdateNoteInput): Promise<NoteWithTags> {
  return request<NoteWithTags>(`/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteNote(id: string): Promise<void> {
  await request(`/notes/${id}`, { method: 'DELETE' })
}

export async function searchNotes(query: string): Promise<NoteWithTags[]> {
  const { notes } = await request<SearchNotesResponse>(`/notes/search?q=${encodeURIComponent(query)}`)
  return notes
}

export async function fetchBacklinks(noteId: string): Promise<BacklinksResponse> {
  return request<BacklinksResponse>(`/notes/${noteId}/backlinks`)
}

export async function updateNoteLinks(noteId: string, targetNoteIds: string[]): Promise<void> {
  await request(`/notes/${noteId}/links`, {
    method: 'PUT',
    body: JSON.stringify({ targetNoteIds }),
  })
}

// ==================== Folders ====================

export async function fetchFolders(): Promise<Folder[]> {
  const { folders } = await request<ListFoldersResponse>('/folders')
  return folders
}

export async function createFolder(input: CreateFolderInput): Promise<Folder> {
  return request<Folder>('/folders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateFolder(id: string, input: UpdateFolderInput): Promise<Folder> {
  return request<Folder>(`/folders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteFolder(id: string): Promise<void> {
  await request(`/folders/${id}`, { method: 'DELETE' })
}

// ==================== Tags ====================

export async function fetchTags(): Promise<TagWithCount[]> {
  const { tags } = await request<ListTagsResponse>('/tags')
  return tags
}

export async function createTag(name: string) {
  return request<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function renameTag(id: string, name: string): Promise<void> {
  await request(`/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/tags/${id}`, { method: 'DELETE' })
}
