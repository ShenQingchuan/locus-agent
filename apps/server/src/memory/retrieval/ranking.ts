import type { NoteWithTags } from '../core/types.js'

export interface RankedResult {
  note: NoteWithTags
  score: number
  vecRank?: number
  keywordRank?: number
}

/**
 * Reciprocal Rank Fusion (RRF).
 * k=60 is the standard constant from the original paper.
 */
export function reciprocalRankFusion(
  vecResults: { noteId: string, distance: number }[],
  keywordResults: { noteId: string }[],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>()

  vecResults.forEach((r, i) => {
    scores.set(r.noteId, (scores.get(r.noteId) ?? 0) + 1 / (k + i + 1))
  })

  keywordResults.forEach((r, i) => {
    scores.set(r.noteId, (scores.get(r.noteId) ?? 0) + 1 / (k + i + 1))
  })

  return scores
}

/**
 * Apply time-decay weighting to memory relevance.
 * Newer memories get a slight boost.
 */
export function applyTimeDecay(
  results: RankedResult[],
  halfLifeDays = 30,
): RankedResult[] {
  const now = Date.now()
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

  return results.map((r) => {
    const ageMs = now - new Date(r.note.updatedAt).getTime()
    const decay = Math.exp(-ageMs / halfLifeMs)
    // Blend RRF score with decay factor (70% semantic rank, 30% recency)
    const boosted = r.score * (0.7 + 0.3 * decay)
    return { ...r, score: boosted }
  })
}
