import type { NewNote, Note, Tag } from '../db/schema.js'
import { desc, eq, inArray, like } from 'drizzle-orm'
import { db, noteConversations, notes, noteTags, tags } from '../db/index.js'
import { getOrCreateTag } from './tag.js'

// ==================== Types ====================

export interface NoteWithTags extends Note {
  tags: Tag[]
}

export interface CreateNoteInput {
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
  /** 关联的对话 ID（来源追踪） */
  conversationId?: string
}

export interface UpdateNoteInput {
  content?: string
  editorState?: Record<string, unknown> | null
  folderId?: string | null
  tagNames?: string[]
}

// ==================== CRUD ====================

/**
 * 创建笔记
 */
export async function createNote(input: CreateNoteInput): Promise<NoteWithTags> {
  const id = crypto.randomUUID()
  const now = new Date()

  const newNote: NewNote = {
    id,
    content: input.content ?? '',
    editorState: input.editorState ?? null,
    folderId: input.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(notes).values(newNote)

  // 处理标签
  if (input.tagNames?.length) {
    await setNoteTags(id, input.tagNames)
  }

  // 关联对话来源
  if (input.conversationId) {
    await db.insert(noteConversations).values({
      noteId: id,
      conversationId: input.conversationId,
    })
  }

  return getNoteWithTags(id) as Promise<NoteWithTags>
}

/**
 * 获取笔记（不含标签）
 */
export async function getNote(id: string): Promise<Note | null> {
  const [note] = await db
    .select()
    .from(notes)
    .where(eq(notes.id, id))

  return note || null
}

/**
 * 获取笔记（含标签）
 */
export async function getNoteWithTags(id: string): Promise<NoteWithTags | null> {
  const note = await getNote(id)
  if (!note)
    return null

  const noteTags_ = await getNoteTags(id)
  return { ...note, tags: noteTags_ }
}

/**
 * 列出笔记（按更新时间倒序，含标签）
 */
export async function listNotes(options?: {
  folderId?: string | null
  tagId?: string
  limit?: number
  offset?: number
}): Promise<NoteWithTags[]> {
  let query = db.select().from(notes)

  // 按文件夹过滤（folderId 为 undefined 表示不过滤 = 全部笔记）
  if (options?.folderId !== undefined && options.folderId !== null) {
    query = query.where(eq(notes.folderId, options.folderId)) as any
  }

  // 按标签过滤
  if (options?.tagId) {
    const noteIdsWithTag = await db
      .select({ noteId: noteTags.noteId })
      .from(noteTags)
      .where(eq(noteTags.tagId, options.tagId))

    const ids = noteIdsWithTag.map(r => r.noteId)
    if (ids.length === 0)
      return []

    query = query.where(inArray(notes.id, ids)) as any
  }

  const result = await (query as any)
    .orderBy(desc(notes.updatedAt))
    .limit(options?.limit ?? 100)
    .offset(options?.offset ?? 0)

  // 为每个笔记附加标签
  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }

  return notesWithTags
}

/**
 * 更新笔记
 */
export async function updateNote(
  id: string,
  input: UpdateNoteInput,
): Promise<NoteWithTags | null> {
  const existing = await getNote(id)
  if (!existing)
    return null

  const updates: Partial<NewNote> & { updatedAt: Date } = { updatedAt: new Date() }

  if (input.content !== undefined)
    updates.content = input.content
  if (input.editorState !== undefined)
    updates.editorState = input.editorState
  if (input.folderId !== undefined)
    updates.folderId = input.folderId

  await db
    .update(notes)
    .set(updates)
    .where(eq(notes.id, id))

  // 更新标签
  if (input.tagNames !== undefined) {
    await setNoteTags(id, input.tagNames)
  }

  return getNoteWithTags(id)
}

/**
 * 删除笔记
 */
export async function deleteNote(id: string): Promise<boolean> {
  const existing = await getNote(id)
  if (!existing)
    return false

  await db.delete(notes).where(eq(notes.id, id))
  return true
}

// ==================== 标签管理 ====================

/**
 * 获取笔记的标签
 */
async function getNoteTags(noteId: string): Promise<Tag[]> {
  const result = await db
    .select({ tag: tags })
    .from(noteTags)
    .innerJoin(tags, eq(noteTags.tagId, tags.id))
    .where(eq(noteTags.noteId, noteId))

  return result.map(r => r.tag)
}

/**
 * 设置笔记的标签（全量替换）
 */
async function setNoteTags(noteId: string, tagNames: string[]): Promise<void> {
  // 清除旧标签
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId))

  // 创建新标签关联
  for (const name of tagNames) {
    const tag = await getOrCreateTag(name)
    await db.insert(noteTags).values({
      noteId,
      tagId: tag.id,
    })
  }
}

// ==================== 搜索 ====================

/**
 * 简单关键词搜索（内容模糊匹配）
 * 后续 Phase 5 会替换为 FTS5 全文搜索
 */
export async function searchNotes(query: string): Promise<NoteWithTags[]> {
  const pattern = `%${query}%`

  const result = await db
    .select()
    .from(notes)
    .where(like(notes.content, pattern))
    .orderBy(desc(notes.updatedAt))
    .limit(50)

  // 附加标签
  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }

  return notesWithTags
}

/**
 * 获取笔记关联的对话 ID 列表
 */
export async function getNoteConversationIds(noteId: string): Promise<string[]> {
  const result = await db
    .select({ conversationId: noteConversations.conversationId })
    .from(noteConversations)
    .where(eq(noteConversations.noteId, noteId))

  return result.map(r => r.conversationId)
}
