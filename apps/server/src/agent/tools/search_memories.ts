import type { NoteWithTags } from '../../services/note.js'
import { tool } from 'ai'
import { z } from 'zod'
import { searchNotesByTags, searchNotesHybrid } from '../../services/note.js'

/**
 * search_memories tool definition.
 *
 * Allows the LLM to retrieve saved memories by semantic vector search
 * and/or tag filtering. At least one of `query` or `tags` must be provided.
 */
export const searchMemoriesTool = tool({
  description:
    'Search saved memories about the user. '
    + 'Use this to recall user preferences, project details, past decisions, or lessons learned. '
    + 'You can search by natural language query, by tags, or both. '
    + 'At least one of "query" or "tags" must be provided.',
  inputSchema: z.object({
    query: z.string().optional().describe(
      'Natural language search query. Uses semantic vector search to find relevant memories. '
      + 'Describe what you are looking for in natural language.',
    ),
    tags: z.array(z.string()).optional().describe(
      'Filter by tag names. Supports prefix matching: "project" matches "project/locus-agent". '
      + 'Common top-level tags: preference, project, lesson, fact.',
    ),
  }).refine(
    data => data.query || (data.tags && data.tags.length > 0),
    { message: 'At least one of "query" or "tags" must be provided.' },
  ),
})

/**
 * Structured result from search_memories execution.
 */
export interface SearchMemoriesResult {
  memories: {
    id: string
    content: string
    tags: string[]
    updatedAt: string
  }[]
  totalFound: number
}

/**
 * Execute search_memories: semantic vector search and/or tag filtering.
 * When both are provided, results are merged (union) and deduplicated,
 * with query results first (most relevant), then tag-only results.
 */
export async function executeSearchMemories(
  args: { query?: string, tags?: string[] },
): Promise<SearchMemoriesResult> {
  const hasQuery = !!args.query?.trim()
  const hasTags = !!args.tags?.length

  let results: NoteWithTags[]

  if (hasQuery && hasTags) {
    // 并行：向量语义搜索 + 标签过滤，合并去重
    const [byQuery, byTags] = await Promise.all([
      searchNotesHybrid(args.query!.trim()),
      searchNotesByTags(args.tags!),
    ])
    const seen = new Set<string>()
    results = []
    // 向量搜索结果优先（语义相关度排序）
    for (const n of byQuery) {
      if (!seen.has(n.id)) {
        seen.add(n.id)
        results.push(n)
      }
    }
    // 补充标签匹配的结果
    for (const n of byTags) {
      if (!seen.has(n.id)) {
        seen.add(n.id)
        results.push(n)
      }
    }
  }
  else if (hasQuery) {
    // 向量语义搜索（模型未加载时降级到 LIKE）
    results = await searchNotesHybrid(args.query!.trim())
  }
  else {
    results = await searchNotesByTags(args.tags!)
  }

  // Cap at 20 to avoid overloading context
  const capped = results.slice(0, 20)

  return {
    memories: capped.map(n => ({
      id: n.id,
      content: n.content,
      tags: n.tags.map(t => t.name),
      updatedAt: n.updatedAt.toISOString(),
    })),
    totalFound: results.length,
  }
}

/**
 * Format SearchMemoriesResult into a string for the LLM.
 */
export function formatSearchMemoriesResult(result: SearchMemoriesResult): string {
  if (result.totalFound === 0) {
    return 'No memories found matching the search criteria.'
  }

  const lines: string[] = []

  if (result.totalFound > result.memories.length) {
    lines.push(`Found ${result.totalFound} memories (showing top ${result.memories.length}):`)
  }
  else {
    lines.push(`Found ${result.totalFound} memory(ies):`)
  }

  for (const mem of result.memories) {
    const tagStr = mem.tags.length > 0 ? ` [${mem.tags.map(t => `#${t}`).join(', ')}]` : ''
    lines.push(`- "${mem.content}"${tagStr}`)
  }

  return lines.join('\n')
}
