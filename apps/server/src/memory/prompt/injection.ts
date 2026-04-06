import type { NoteWithTags } from '../core/types.js'

export function formatMemoriesForPrompt(memories: NoteWithTags[]): string {
  if (memories.length === 0)
    return ''

  const lines = memories.map((note) => {
    const tags = note.tags.map(t => `#${t.name}`).join(' ')
    const tagStr = tags ? ` ${tags}` : ''
    return `- ${note.content}${tagStr}`
  })

  return lines.join('\n')
}

export function buildRelevantMemoriesPrompt(memories: NoteWithTags[]): string {
  if (memories.length === 0)
    return ''

  return `## Relevant Memories\n${formatMemoriesForPrompt(memories)}`
}
