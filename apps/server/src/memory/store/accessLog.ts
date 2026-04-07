import { and, count, gte, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { memoryAccessLogs } from '../../db/schema.js'

export async function logMemoryAccess(
  noteIds: string[],
  conversationId: string | undefined,
  accessType: 'injection' | 'tool_call',
): Promise<void> {
  if (noteIds.length === 0)
    return

  const now = new Date()
  const values = noteIds.map(noteId => ({
    id: crypto.randomUUID(),
    noteId,
    conversationId: conversationId ?? null,
    accessType,
    accessedAt: now,
  }))

  // Batch insert in chunks to avoid SQLite parameter limits
  const CHUNK_SIZE = 500
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE)
    await db.insert(memoryAccessLogs).values(chunk)
  }
}

export async function getRecentAccessedNoteIds(
  days = 7,
  limit = 1000,
): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({ noteId: memoryAccessLogs.noteId })
    .from(memoryAccessLogs)
    .where(gte(memoryAccessLogs.accessedAt, since))
    .orderBy(memoryAccessLogs.accessedAt)
    .limit(limit)

  return [...new Set(rows.map(r => r.noteId))]
}

export async function getAccessCounts(
  noteIds: string[],
  days = 7,
): Promise<Map<string, number>> {
  if (noteIds.length === 0)
    return new Map()

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      noteId: memoryAccessLogs.noteId,
      count: count(memoryAccessLogs.id),
    })
    .from(memoryAccessLogs)
    .where(
      and(
        inArray(memoryAccessLogs.noteId, noteIds),
        gte(memoryAccessLogs.accessedAt, since),
      ),
    )
    .groupBy(memoryAccessLogs.noteId)

  return new Map(rows.map(r => [r.noteId, r.count]))
}
