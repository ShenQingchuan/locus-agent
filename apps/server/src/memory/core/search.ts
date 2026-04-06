import type { NoteWithTags } from './types.js'
import { searchMemoriesHybrid } from '../retrieval/hybrid.js'
import { searchNotesByTags } from '../store/noteBridge.js'

export async function searchMemories(
  query: string,
  tags?: string[],
): Promise<NoteWithTags[]> {
  return searchMemoriesHybrid(query, tags)
}

export async function searchMemoriesByTags(tagNames: string[], limit = 50): Promise<NoteWithTags[]> {
  return searchNotesByTags(tagNames, limit)
}
