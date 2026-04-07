import type { NoteWithTags } from '../core/types.js'
import { and, count, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { memoryAccessLogs, notes } from '../../db/schema.js'

const TOKEN_ESTIMATE_DIVISOR = 4

export async function getWorkingSetMemories(
  workspacePath?: string,
  limit = 7,
  maxTokens = 800,
): Promise<NoteWithTags[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // 1. Build candidate conditions
  const conditions = [
    eq(notes.pinned, true),
    inArray(
      notes.id,
      db
        .select({ noteId: memoryAccessLogs.noteId })
        .from(memoryAccessLogs)
        .where(gte(memoryAccessLogs.accessedAt, since7d)),
    ),
    gte(notes.updatedAt, since30d),
  ]

  const workspaceConditions = [or(...conditions)]

  if (workspacePath) {
    workspaceConditions.push(
      or(
        eq(notes.workspacePath, workspacePath),
        isNull(notes.workspacePath),
      ),
    )
  }

  // 2. Fetch candidates with scoring via subquery/JS
  const candidates = await db
    .select()
    .from(notes)
    .where(and(...workspaceConditions))
    .orderBy(desc(notes.updatedAt))
    .limit(50)

  // 3. Query access counts for candidates in one batch
  const accessCountRows = await db
    .select({
      noteId: memoryAccessLogs.noteId,
      count: count(memoryAccessLogs.id),
    })
    .from(memoryAccessLogs)
    .where(
      and(
        inArray(
          memoryAccessLogs.noteId,
          candidates.map(n => n.id),
        ),
        gte(memoryAccessLogs.accessedAt, since7d),
      ),
    )
    .groupBy(memoryAccessLogs.noteId)

  const accessCountMap = new Map(accessCountRows.map(r => [r.noteId, r.count]))

  // 4. Score candidates
  const scored = candidates.map((note) => {
    let score = 0
    if (note.pinned)
      score += 3
    const accessCount = accessCountMap.get(note.id) ?? 0
    score += Math.min(accessCount, 3)
    if (new Date(note.updatedAt) >= since7d)
      score += 1
    if (workspacePath && note.workspacePath === workspacePath)
      score += 1

    return { note, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // 5. Take top N while respecting token budget
  const selected: NoteWithTags[] = []
  let tokens = 0
  for (const { note } of scored) {
    const noteTokens = Math.ceil((note.content?.length ?? 0) / TOKEN_ESTIMATE_DIVISOR)
    if (tokens + noteTokens > maxTokens && selected.length >= 3) {
      break
    }
    selected.push({ ...note, tags: [] })
    tokens += noteTokens
    if (selected.length >= limit)
      break
  }

  // 6. Hydrate tags for selected notes
  if (selected.length === 0)
    return []

  const { getNoteTags } = await import('../store/noteBridge.js')
  const result: NoteWithTags[] = []
  for (const note of selected) {
    const tags = await getNoteTags(note.id)
    result.push({ ...note, tags })
  }

  return result
}
