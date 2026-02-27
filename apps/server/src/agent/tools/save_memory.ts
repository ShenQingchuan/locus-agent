import { tool } from 'ai'
import { z } from 'zod'
import { createNote } from '../../services/note.js'

/**
 * save_memory tool definition.
 *
 * Allows the LLM to persist important information about the user,
 * such as preferences, project details, and lessons learned.
 * Each memory is a short note with optional multi-level tags.
 */
export const saveMemoryTool = tool({
  description:
    'Save one or more memories about the user for future reference. '
    + 'Use this when you learn important information such as user preferences, '
    + 'project details, technical decisions, or lessons learned. '
    + 'Each memory should be concise (1-3 sentences). '
    + 'Tags use multi-level format like "preference/code-style", "project/my-app", "lesson/deployment".',
  inputSchema: z.object({
    memories: z.array(z.object({
      content: z.string().describe('The memory content, 1-3 sentences. Be specific and factual.'),
      tags: z.array(z.string()).describe(
        'Tags for categorization. Use multi-level format with "/" separator, '
        + 'e.g. ["preference/tools", "project/locus-agent"]. '
        + 'Common top-level tags: preference, project, lesson, fact.',
      ),
    })).min(1).describe('Array of memories to save.'),
  }),
})

/**
 * Structured result from save_memory execution.
 */
export interface SaveMemoryResult {
  saved: {
    id: string
    content: string
    tags: string[]
  }[]
  totalSaved: number
}

/**
 * Execute save_memory: creates notes and associates tags.
 *
 * @param args - Tool arguments from the LLM
 * @param args.memories - Array of memories to save
 * @param conversationId - Current conversation ID for provenance tracking
 */
export async function executeSaveMemory(
  args: { memories: { content: string, tags: string[] }[] },
  conversationId?: string,
): Promise<SaveMemoryResult> {
  const saved: SaveMemoryResult['saved'] = []

  for (const mem of args.memories) {
    const note = await createNote({
      content: mem.content,
      tagNames: mem.tags,
      conversationId,
    })

    saved.push({
      id: note.id,
      content: note.content,
      tags: note.tags.map(t => t.name),
    })
  }

  return {
    saved,
    totalSaved: saved.length,
  }
}

/**
 * Format SaveMemoryResult into a string for the LLM.
 */
export function formatSaveMemoryResult(result: SaveMemoryResult): string {
  if (result.totalSaved === 0) {
    return 'No memories were saved.'
  }

  const lines = [`Saved ${result.totalSaved} memory(ies):`]
  for (const mem of result.saved) {
    const tagStr = mem.tags.length > 0 ? ` [${mem.tags.map(t => `#${t}`).join(', ')}]` : ''
    lines.push(`- "${mem.content}"${tagStr}`)
  }

  return lines.join('\n')
}
