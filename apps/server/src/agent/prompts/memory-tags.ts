import { listTagsWithCount } from '../../services/tag.js'

/**
 * Build prompt section listing existing memory tags for the AI to prefer reusing.
 * Returns empty string if no tags exist.
 */
export async function buildMemoryTagsPrompt(): Promise<string> {
  const tags = await listTagsWithCount()
  if (tags.length === 0)
    return ''

  const lines = tags
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `  - ${t.name} (${t.noteCount})`)
    .join('\n')

  return `## Existing Memory Tags

When creating or updating memories, ALWAYS prefer using these existing tags over creating new ones.
Use the most specific (granular) tag that fits; only use a parent-level tag when no subcategory applies.
Create a new tag only when no existing tag is semantically appropriate.

Existing tags:
${lines}`
}
