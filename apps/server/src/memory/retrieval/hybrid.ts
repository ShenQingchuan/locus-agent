import type { NoteWithTags } from '../core/types.js'
import { and, inArray, like } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notes } from '../../db/schema.js'
import { getNotesWithTagsByIds, searchNotesByTags } from '../store/noteBridge.js'
import { applyAccessBoost, applyTimeDecay, reciprocalRankFusion } from './ranking.js'
import { searchMemoriesByVector } from './vector.js'

export async function searchMemoriesHybrid(
  query: string,
  tags?: string[],
): Promise<NoteWithTags[]> {
  const trimmedQuery = query.trim()
  const hasQuery = trimmedQuery.length > 0
  const hasTags = tags && tags.length > 0

  let vecResults: { noteId: string, distance: number }[] = []
  let keywordResults: { noteId: string }[] = []
  let tagResults: NoteWithTags[] = []
  let candidateNoteIds: string[] | undefined

  if (hasTags) {
    tagResults = await searchNotesByTags(tags!)
    candidateNoteIds = tagResults.map(n => n.id)
  }

  if (hasQuery) {
    // Use tag-filtered candidates for vector search when tags are provided.
    // If candidate list is too small, fall back to full search.
    const useCandidateFilter = candidateNoteIds && candidateNoteIds.length >= 3
    vecResults = await searchMemoriesByVector(
      trimmedQuery,
      30,
      useCandidateFilter ? candidateNoteIds : undefined,
    )

    const pattern = `%${trimmedQuery}%`
    const likeConditions = [like(notes.content, pattern)]
    if (useCandidateFilter && candidateNoteIds) {
      likeConditions.push(inArray(notes.id, candidateNoteIds))
    }

    const likeResults = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(...likeConditions))
      .limit(30)
    keywordResults = likeResults.map(r => ({ noteId: r.id }))
  }

  // Merge vector + keyword with RRF
  const rrfScores = reciprocalRankFusion(vecResults, keywordResults)

  // Add tag-only results with a baseline score
  if (hasTags) {
    tagResults.forEach((note, i) => {
      const existing = rrfScores.get(note.id) ?? 0
      rrfScores.set(note.id, existing + 1 / (60 + i + 1))
    })
  }

  if (rrfScores.size === 0)
    return []

  const allIds = Array.from(rrfScores.keys())
  const matchedNotes = await getNotesWithTagsByIds(allIds)
  const noteMap = new Map(matchedNotes.map(n => [n.id, n]))

  const ranked: Parameters<typeof applyTimeDecay>[0] = []
  for (const [noteId, score] of rrfScores.entries()) {
    const note = noteMap.get(noteId)
    if (note) {
      ranked.push({ note, score })
    }
  }

  ranked.sort((a, b) => b.score - a.score)

  const decayed = applyTimeDecay(ranked)
  const boosted = await applyAccessBoost(decayed)
  return boosted.map(r => r.note)
}
