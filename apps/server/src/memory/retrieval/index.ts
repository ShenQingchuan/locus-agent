import type { NoteWithTags } from '../core/types.js'
import { searchNotesByTags } from '../store/noteBridge.js'
import { searchMemoriesHybrid } from './hybrid.js'

export interface RetrieveOptions {
  topK?: number
  maxTokens?: number
}

export async function retrieveRelevantMemories(
  query: string,
  workspacePath: string | undefined,
  options: RetrieveOptions = {},
): Promise<NoteWithTags[]> {
  const { topK = 5 } = options

  const results = await searchMemoriesHybrid(query)

  // Workspace scope boosting: same-workspace memories are preferred,
  // but global memories are also included.
  const scored = results.map((note) => {
    const isSameWorkspace = workspacePath
      ? note.workspacePath === workspacePath
      : note.workspacePath === null
    // Small boost for workspace match
    const score = isSameWorkspace ? 1.05 : 1.0
    return { note, score }
  })

  // Re-sort by boosted relevance (already sorted from hybrid search,
  // but we want workspace matches to bubble up slightly)
  scored.sort((a, b) => {
    // Preserve original order for equal scores (stable-ish)
    if (b.score !== a.score)
      return b.score - a.score
    return 0
  })

  return scored.slice(0, topK).map(r => r.note)
}

export async function retrieveMemoriesByTags(
  tagNames: string[],
  limit = 20,
): Promise<NoteWithTags[]> {
  return searchNotesByTags(tagNames, limit)
}
