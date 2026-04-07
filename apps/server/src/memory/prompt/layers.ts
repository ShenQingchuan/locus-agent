import type { NoteWithTags } from '../core/types.js'
import { getWorkingSetMemories } from '../retrieval/workingSet.js'
import { getMemoryIdentity } from './identity.js'

export async function renderL0Identity(): Promise<string> {
  const identity = getMemoryIdentity()
  if (!identity.trim())
    return ''
  return `## Identity\n${identity.trim()}`
}

export async function renderL1WorkingSet(workspacePath?: string): Promise<string> {
  const memories = await getWorkingSetMemories(workspacePath)
  if (memories.length === 0)
    return ''

  const lines = memories.map((note) => {
    const tags = note.tags.map(t => `#${t.name}`).join(' ')
    const tagStr = tags ? ` ${tags}` : ''
    return `- ${note.content}${tagStr}`
  })

  return `## Working Memory\n${lines.join('\n')}`
}

export function renderL2PrimedContext(): string {
  return `## Memory Library

You have access to a persistent memory library. When you need background about the user, use \`search_memory\` with relevant tags:
- Preferences and habits: tags starting with \`preference/\`
- Facts and background: tags starting with \`fact/\` or \`project/\`
- Lessons and past decisions: tags starting with \`lesson/\` or \`decision/\`
- Workflows and procedures: tags starting with \`workflow/\``
}

export function renderL3DeepContext(memories: NoteWithTags[]): string {
  if (memories.length === 0)
    return ''

  const lines = memories.map((note) => {
    const tags = note.tags.map(t => `#${t.name}`).join(' ')
    const tagStr = tags ? ` ${tags}` : ''
    return `- ${note.content}${tagStr}`
  })

  return `## Relevant Context\n${lines.join('\n')}`
}
