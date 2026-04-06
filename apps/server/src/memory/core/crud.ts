import type { CreateMemoryInput, NoteWithTags, UpdateMemoryInput } from './types.js'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notes } from '../../db/schema.js'
import { enqueueEmbedding, enqueueEmbeddingDeletion } from '../embedding/queue.js'
import {
  getNoteWithTags,
  insertNoteProvenance,
  listNotesWithTags,
  setNoteTags,
} from '../store/noteBridge.js'

export async function createMemory(input: CreateMemoryInput): Promise<NoteWithTags> {
  const id = crypto.randomUUID()
  const now = new Date()

  await db.insert(notes).values({
    id,
    content: input.content ?? '',
    editorState: input.editorState ?? null,
    folderId: input.folderId ?? null,
    workspacePath: input.workspacePath ?? null,
    createdAt: now,
    updatedAt: now,
  })

  if (input.tagNames?.length) {
    await setNoteTags(id, input.tagNames)
  }

  if (input.conversationId) {
    await insertNoteProvenance(id, input.conversationId)
  }

  const result = await getNoteWithTags(id)
  if (result) {
    enqueueEmbedding(result.id, result.content, result.tags.map(t => t.name))
  }
  return result!
}

export async function updateMemory(
  id: string,
  input: UpdateMemoryInput,
): Promise<NoteWithTags | null> {
  const [existing] = await db.select().from(notes).where(eq(notes.id, id))
  if (!existing)
    return null

  const updates: Partial<typeof existing> & { updatedAt: Date } = { updatedAt: new Date() }

  if (input.content !== undefined)
    updates.content = input.content
  if (input.editorState !== undefined)
    updates.editorState = input.editorState
  if (input.folderId !== undefined)
    updates.folderId = input.folderId
  if (input.workspacePath !== undefined)
    updates.workspacePath = input.workspacePath

  await db.update(notes).set(updates).where(eq(notes.id, id))

  if (input.tagNames !== undefined) {
    await setNoteTags(id, input.tagNames)
  }

  const result = await getNoteWithTags(id)
  if (result && (input.content !== undefined || input.tagNames !== undefined)) {
    enqueueEmbedding(result.id, result.content, result.tags.map(t => t.name))
  }
  return result
}

export async function deleteMemory(id: string): Promise<boolean> {
  const [existing] = await db.select().from(notes).where(eq(notes.id, id))
  if (!existing)
    return false

  await db.delete(notes).where(eq(notes.id, id))
  enqueueEmbeddingDeletion(id)
  return true
}

export { listNotesWithTags as listMemories }
