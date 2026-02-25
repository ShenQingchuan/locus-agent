/**
 * 知识库相关类型定义
 */

// ==================== 笔记 ====================

export interface Note {
  id: string
  title: string
  /** Markdown 纯文本 */
  content: string
  /** ProseKit EditorState JSON */
  editorState?: Record<string, unknown> | null
  /** LLM-generated summary (reserved for future use, currently empty) */
  summary?: string | null
  folderId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface NoteWithTags extends Note {
  tags: Tag[]
}

export interface CreateNoteInput {
  title: string
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
  conversationId?: string
}

export interface UpdateNoteInput {
  title?: string
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
}

// ==================== 文件夹 ====================

export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: Date
}

export interface CreateFolderInput {
  name: string
  parentId?: string | null
}

export interface UpdateFolderInput {
  name?: string
  parentId?: string | null
  sortOrder?: number
}

// ==================== 标签 ====================

export interface Tag {
  id: string
  name: string
  createdAt: Date
}

export interface TagWithCount extends Tag {
  noteCount: number
}

// ==================== API 响应 ====================

export interface ListNotesResponse {
  notes: NoteWithTags[]
}

export interface ListFoldersResponse {
  folders: Folder[]
}

export interface ListTagsResponse {
  tags: TagWithCount[]
}

export interface SearchNotesResponse {
  notes: NoteWithTags[]
}

export interface BacklinksResponse {
  backlinks: Note[]
}
