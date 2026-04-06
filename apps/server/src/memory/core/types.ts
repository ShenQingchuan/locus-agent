import type { Note, Tag } from '../../db/schema.js'

export interface NoteWithTags extends Note {
  tags: Tag[]
}

export interface CreateMemoryInput {
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
  conversationId?: string
  workspacePath?: string | null
}

export interface UpdateMemoryInput {
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
  workspacePath?: string | null
}
