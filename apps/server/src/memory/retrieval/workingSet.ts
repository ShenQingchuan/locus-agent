import type { NoteWithTags } from '../core/types.js'
import { and, count, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { memoryAccessLogs, notes } from '../../db/schema.js'
import { TIER1_TAG_PREFIXES } from '../taxonomy.js'

const TOKEN_ESTIMATE_DIVISOR = 4
const TRAILING_SLASH_RE = /\/$/

export async function getWorkingSetMemories(
  workspacePath?: string,
  limit = 10,
  maxTokens = 1000,
): Promise<NoteWithTags[]> {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // 1. Unconditionally fetch Tier 1 (identity/*) memories — self-schema is
  //    chronically accessible and not subject to time-window filters.
  const { searchNotesByTags } = await import('../store/noteBridge.js')
  const identityMemories = await searchNotesByTags(
    TIER1_TAG_PREFIXES.map(p => p.replace(TRAILING_SLASH_RE, '')),
    20,
  )
  const identityIds = new Set(identityMemories.map(n => n.id))

  // 2. Build candidate conditions for non-identity memories
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

  // 3. Fetch heuristic candidates
  const candidates = await db
    .select()
    .from(notes)
    .where(and(...workspaceConditions))
    .orderBy(desc(notes.updatedAt))
    .limit(50)

  // 4. Query access counts for all candidates in one batch
  const allCandidateIds = [
    ...identityMemories.map(n => n.id),
    ...candidates.map(n => n.id),
  ]
  const accessCountRows = allCandidateIds.length > 0
    ? await db
        .select({
          noteId: memoryAccessLogs.noteId,
          count: count(memoryAccessLogs.id),
        })
        .from(memoryAccessLogs)
        .where(
          and(
            inArray(memoryAccessLogs.noteId, allCandidateIds),
            gte(memoryAccessLogs.accessedAt, since7d),
          ),
        )
        .groupBy(memoryAccessLogs.noteId)
    : []

  const accessCountMap = new Map(accessCountRows.map(r => [r.noteId, r.count]))

  // 5. Score: identity memories get highest priority (score 5),
  //    then pinned (3), access recency, update recency, workspace match.
  interface ScoredNote { note: NoteWithTags, score: number }
  const scoredMap = new Map<string, ScoredNote>()

  for (const note of identityMemories) {
    const accessCount = accessCountMap.get(note.id) ?? 0
    scoredMap.set(note.id, { note, score: 5 + Math.min(accessCount, 2) })
  }

  for (const note of candidates) {
    if (scoredMap.has(note.id))
      continue

    let score = 0
    if (note.pinned)
      score += 3
    const accessCount = accessCountMap.get(note.id) ?? 0
    score += Math.min(accessCount, 3)
    if (new Date(note.updatedAt) >= since7d)
      score += 1
    if (workspacePath && note.workspacePath === workspacePath)
      score += 1

    scoredMap.set(note.id, { note: { ...note, tags: [] }, score })
  }

  const scored = [...scoredMap.values()]
  scored.sort((a, b) => b.score - a.score)

  // 6. Take top N while respecting token budget (identity memories bypass
  //    the minimum-3 gate so they are always included).
  const selected: NoteWithTags[] = []
  let tokens = 0
  for (const { note, score: _score } of scored) {
    const noteTokens = Math.ceil((note.content?.length ?? 0) / TOKEN_ESTIMATE_DIVISOR)
    const isIdentity = identityIds.has(note.id)
    if (tokens + noteTokens > maxTokens && selected.length >= 3 && !isIdentity)
      break
    selected.push(note)
    tokens += noteTokens
    if (selected.length >= limit)
      break
  }

  // 7. Hydrate tags for non-identity notes (identity notes already have tags)
  if (selected.length === 0)
    return []

  const { getNoteTags } = await import('../store/noteBridge.js')
  const result: NoteWithTags[] = []
  for (const note of selected) {
    if (identityIds.has(note.id)) {
      result.push(note)
    }
    else {
      const hydrated = await getNoteTags(note.id)
      result.push({ ...note, tags: hydrated })
    }
  }

  return result
}
