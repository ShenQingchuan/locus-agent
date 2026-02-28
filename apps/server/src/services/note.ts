import type { NewNote, Note, Tag } from '../db/schema.js'
import { count, desc, eq, inArray, like } from 'drizzle-orm'
import { db, isVecAvailable, noteConversations, notes, noteTags, tags } from '../db/index.js'
import { getOrCreateTag } from './tag.js'

// ==================== Embedding 自动索引 ====================

/**
 * Async embed a note and store in vector DB (fire-and-forget).
 * Requires Zhipu API key to be configured and sqlite-vec to be available.
 */
function autoEmbedNote(noteId: string, content: string): void {
  if (!isVecAvailable() || !content.trim())
    return

  import('./embedding.js').then(async ({ embedPassage, isEmbeddingConfigured }) => {
    if (!isEmbeddingConfigured())
      return
    const vector = await embedPassage(content)
    const { upsertNoteEmbedding } = await import('./vectorStore.js')
    upsertNoteEmbedding(noteId, vector)
  }).catch((err) => {
    console.warn('[auto-embed] Failed to embed note:', noteId, err)
  })
}

/**
 * 异步删除笔记的 embedding（fire-and-forget）
 */
function autoDeleteEmbedding(noteId: string): void {
  if (!isVecAvailable())
    return

  import('./vectorStore.js').then(({ deleteNoteEmbedding }) => {
    deleteNoteEmbedding(noteId)
  }).catch(() => {
    // 忽略错误
  })
}

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

  const result = await getNoteWithTags(id) as NoteWithTags

  // 异步生成 embedding（不阻塞响应）
  autoEmbedNote(result.id, result.content)

  return result
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

  const result = await getNoteWithTags(id)

  // 内容变更时重新生成 embedding
  if (input.content !== undefined && result) {
    autoEmbedNote(id, result.content)
  }

  return result
}

/**
 * 删除笔记
 */
export async function deleteNote(id: string): Promise<boolean> {
  const existing = await getNote(id)
  if (!existing)
    return false

  await db.delete(notes).where(eq(notes.id, id))

  // 同步删除 embedding
  autoDeleteEmbedding(id)

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
 * Hybrid search: run vector semantic search AND keyword LIKE in parallel,
 * merge results with vector hits first (filtered by distance threshold),
 * keyword-only hits appended after. Either source can fail independently.
 */
export async function searchNotesHybrid(query: string): Promise<NoteWithTags[]> {
  const { isEmbeddingConfigured, embedQuery } = await import('./embedding.js')
  const { isVecAvailable, searchByVector } = await import('./vectorStore.js')

  // Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite.
  // Two-layer filter:
  //   1) hard ceiling — reject anything above this regardless
  //   2) relative factor — reject if distance > best_distance * factor
  // A result must pass BOTH to be included.
  const VEC_HARD_CEILING = 0.55
  const VEC_RELATIVE_FACTOR = 1.25

  // --- 1. Vector semantic search (best-effort) ---
  let vecMatchedIds: string[] = []

  if (isEmbeddingConfigured() && isVecAvailable()) {
    try {
      const queryVector = await embedQuery(query)
      const vecResults = searchByVector(queryVector, 30)

      if (vecResults.length > 0) {
        const bestDist = vecResults[0].distance
        const adaptiveThreshold = Math.min(bestDist * VEC_RELATIVE_FACTOR, VEC_HARD_CEILING)

        vecMatchedIds = vecResults
          .filter(r => r.distance <= adaptiveThreshold)
          .map(r => r.noteId)
      }
    }
    catch (err) {
      console.warn('[search] Vector search failed, continuing with keyword search:', err)
    }
  }

  // --- 2. Keyword LIKE search (always runs as supplement) ---
  const pattern = `%${query}%`
  const likeResults = await db
    .select({ id: notes.id })
    .from(notes)
    .where(like(notes.content, pattern))
    .limit(30)
  const likeMatchedIds = likeResults.map(r => r.id)

  // --- 3. Merge: vector results first, keyword-only results appended ---
  const seen = new Set<string>()
  const matchedIds: string[] = []

  for (const id of vecMatchedIds) {
    if (!seen.has(id)) {
      seen.add(id)
      matchedIds.push(id)
    }
  }
  for (const id of likeMatchedIds) {
    if (!seen.has(id)) {
      seen.add(id)
      matchedIds.push(id)
    }
  }

  if (matchedIds.length === 0)
    return []

  const result = await db
    .select()
    .from(notes)
    .where(inArray(notes.id, matchedIds))

  const noteMap = new Map(result.map(n => [n.id, n]))
  const notesWithTags: NoteWithTags[] = []
  for (const id of matchedIds) {
    const note = noteMap.get(id)
    if (note) {
      const noteTags_ = await getNoteTags(note.id)
      notesWithTags.push({ ...note, tags: noteTags_ })
    }
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

// ==================== 记忆（AI 上下文用） ====================

/**
 * 按标签名搜索记忆
 */
export async function searchNotesByTags(tagNames: string[]): Promise<NoteWithTags[]> {
  if (tagNames.length === 0)
    return []

  // 查找匹配的 tag IDs（支持前缀匹配，如 "project" 匹配 "project/locus-agent"）
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
    .limit(50)

  const notesWithTags: NoteWithTags[] = []
  for (const note of result) {
    const noteTags_ = await getNoteTags(note.id)
    notesWithTags.push({ ...note, tags: noteTags_ })
  }

  return notesWithTags
}

/**
 * 获取记忆统计摘要（用于 system prompt 中的概览信息）
 */
export async function getMemoryStats(): Promise<{
  totalCount: number
  tagSummary: { name: string, count: number }[]
}> {
  // 总记忆数
  const [countResult] = await db
    .select({ value: count() })
    .from(notes)
  const totalCount = countResult?.value ?? 0

  // 各标签的记忆数（按数量降序，top 10）
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
