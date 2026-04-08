import type { NoteWithTags } from '../core/types.js'
import { searchNotesByTags } from '../store/noteBridge.js'
import { hasCodingPrimedTags, hasWorkspacePrimedTags } from '../taxonomy.js'
import { searchMemoriesHybrid } from './hybrid.js'

export interface RetrieveOptions {
  topK?: number
  maxTokens?: number
  space?: string
}

export async function retrieveRelevantMemories(
  query: string,
  workspacePath: string | undefined,
  options: RetrieveOptions = {},
): Promise<NoteWithTags[]> {
  const { topK = 5, space } = options

  const results = await searchMemoriesHybrid(query)
  const isCoding = space === 'coding'

  const scored = results.map((note) => {
    let score = 1.0
    const tagNames = note.tags.map(t => t.name)

    // Workspace scope boosting
    const isSameWorkspace = workspacePath
      ? note.workspacePath === workspacePath
      : note.workspacePath === null

    if (isSameWorkspace)
      score *= 1.05

    // Tier 2 context-primed boosting based on activation tiers
    if (isCoding && hasCodingPrimedTags(tagNames))
      score *= 1.15

    if (isSameWorkspace && hasWorkspacePrimedTags(tagNames))
      score *= 1.2

    return { note, score }
  })

  scored.sort((a, b) => {
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
