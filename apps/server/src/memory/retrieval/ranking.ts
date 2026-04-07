import type { RankedResult } from './ranking-core.js'
import { getAccessCounts, getRecentAccessedNoteIds } from '../store/accessLog.js'
import { applyTimeDecay, reciprocalRankFusion } from './ranking-core.js'

export { applyTimeDecay, type RankedResult, reciprocalRankFusion }

/**
 * Boost recently accessed and pinned memories.
 */
export async function applyAccessBoost(
  results: RankedResult[],
): Promise<RankedResult[]> {
  if (results.length === 0)
    return []

  const noteIds = results.map(r => r.note.id)
  const [accessedIds, accessCounts] = await Promise.all([
    getRecentAccessedNoteIds(7, 1000),
    getAccessCounts(noteIds, 7),
  ])

  const accessedSet = new Set(accessedIds)

  // Bulk fetch pinned status for all result notes
  const { db } = await import('../../db/index.js')
  const { notes } = await import('../../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const pinnedRows = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.pinned, true))
    .all()
  const pinnedSet = new Set(pinnedRows.map(r => r.id))

  return results.map((r) => {
    let boost = 0
    if (pinnedSet.has(r.note.id)) {
      boost += 0.25
    }
    if (accessedSet.has(r.note.id)) {
      const count = Math.min(accessCounts.get(r.note.id) ?? 1, 3)
      boost += count * 0.05 // up to 0.15
    }
    return { ...r, score: r.score + boost }
  }).sort((a, b) => b.score - a.score)
}
