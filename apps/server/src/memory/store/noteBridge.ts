import type { NoteWithTags } from '../core/types.js'
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { noteConversations, notes, noteTags, tags } from '../../db/schema.js'
import { getOrCreateTag } from '../../services/tag.js'

export async function getNoteTags(noteId: string) {
  const result = await db
    .select({ tag: tags })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(eq(noteTags.noteId, noteId))

  return result.map(r => r.tag)
}

export async function setNoteTags(noteId: string, tagNames: string[]): Promise<void> {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId))
  for (const name of tagNames) {
    const tag = await getOrCreateTag(name)
    await db.insert(noteTags).values({ noteId, tagId: tag.id })
  }
}

export async function getNoteWithTags(id: string): Promise<NoteWithTags | null> {
  const [note] = await db.select().from(notes).where(eq(notes.id, id))
  if (!note)
    return null
  const noteTags_ = await getNoteTags(id)
  return { ...note, tags: noteTags_ }
}

export async function getNotesWithTagsByIds(ids: string[]): Promise<NoteWithTags[]> {
  if (ids.length === 0)
    return []
  const result = await db.select().from(notes).where(inArray(notes.id, ids))
  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }
  return notesWithTags
}

export async function listNotesWithTags(options?: {
  folderId?: string | null
  tagId?: string
  workspacePath?: string | 'global'
  limit?: number
  offset?: number
}): Promise<NoteWithTags[]> {
  const conditions = []

  if (options?.folderId !== undefined && options.folderId !== null) {
    conditions.push(eq(notes.folderId, options.folderId))
  }

  if (options?.workspacePath === 'global') {
    conditions.push(isNull(notes.workspacePath))
  }
  else if (options?.workspacePath) {
    conditions.push(eq(notes.workspacePath, options.workspacePath))
  }

  if (options?.tagId) {
    const noteIdsWithTag = await db
      .select({ noteId: noteTags.noteId })
      .from(noteTags)
      .where(eq(noteTags.tagId, options.tagId))

    const ids = noteIdsWithTag.map(r => r.noteId)
    if (ids.length === 0)
      return []
    conditions.push(inArray(notes.id, ids))
  }

  const query = conditions.length > 0
    ? db.select().from(notes).where(and(...conditions))
    : db.select().from(notes)

  const result = await query
    .orderBy(desc(notes.updatedAt))
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0)

  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }

  return notesWithTags
}

export async function searchNotesByTags(tagNames: string[], limit = 50): Promise<NoteWithTags[]> {
  if (tagNames.length === 0)
    return []

  const allTags = await db.select().from(tags)
  const matchedTagIds = allTags
    .filter(t => tagNames.some(name =>
      t.name === name || t.name.startsWith(`${name}/`),
    ))
    .map(t => t.id)

  if (matchedTagIds.length === 0)
    return []

  const noteIdsWithTag = await db
    .select({ noteId: noteTags.noteId })
    .from(noteTags)
    .where(inArray(noteTags.tagId, matchedTagIds))

  const uniqueIds = [...new Set(noteIdsWithTag.map(r => r.noteId))]
  if (uniqueIds.length === 0)
    return []

  const result = await db
    .select()
    .from(notes)
    .where(inArray(notes.id, uniqueIds))
    .orderBy(desc(notes.updatedAt))
    .limit(limit)

  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }

  return notesWithTags
}

export async function getMemoryStats(): Promise<{
  totalCount: number
  tagSummary: { name: string, count: number }[]
}> {
  const [countResult] = await db.select({ value: count() }).from(notes)
  const totalCount = countResult?.value ?? 0

  const tagCountResults = await db
    .select({
      name: tags.name,
      noteCount: count(),
    })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .groupBy(tags.name)
    .orderBy(desc(count()))
    .limit(10)

  return {
    totalCount,
    tagSummary: tagCountResults.map(r => ({ name: r.name, count: r.noteCount })),
  }
}

export async function insertNoteProvenance(noteId: string, conversationId: string): Promise<void> {
  await db.insert(noteConversations).values({ noteId, conversationId })
}

export async function getNoteConversationIds(noteId: string): Promise<string[]> {
  const result = await db
    .select({ conversationId: noteConversations.conversationId })
    .from(noteConversations)
    .where(eq(noteConversations.noteId, noteId))

  return result.map(r => r.conversationId)
}
