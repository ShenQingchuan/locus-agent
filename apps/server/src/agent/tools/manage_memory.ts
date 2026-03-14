import type { NoteWithTags } from '../../services/note.js'
import { tool } from 'ai'
import { z } from 'zod'
import {
  createNote,
  deleteNote,
  listNotes,
  searchNotesByTags,
  searchNotesHybrid,
  updateNote,
} from '../../services/note.js'

const memoryItemSchema = z.object({
  content: z.string().describe('The memory content, 1-3 sentences. Be specific and factual.'),
  tags: z.array(z.string()).describe(
    'Tags for categorization. Use multi-level hierarchical format with "/" separator. '
    + 'Always create at least 2 levels: a broad category followed by a specific subcategory. '
    + 'Examples:\n'
    + '  - Food preferences: "preference/food/snacks", "preference/food/dishes", "preference/food/drinks"\n'
    + '  - Code style: "preference/code-style/naming", "preference/code-style/formatting"\n'
    + '  - Project details: "project/my-app/architecture", "project/my-app/dependencies"\n'
    + '  - Lessons learned: "lesson/debugging", "lesson/performance"\n'
    + 'Group related memories under the same parent path so they cluster naturally. '
    + 'Avoid flat, overly broad tags — always think about what subcategory the memory belongs to.',
  ),
})

/**
 * manage_memory tool definition.
 *
 * Single tool for CRUD on persistent memories (notes with tags).
 * Supports create, read (search), update (content and/or tags), delete.
 */
const batchUpdateItemSchema = z.object({
  memory_id: z.string().describe('ID of the memory to update (from a prior read result).'),
  content: z.string().optional().describe('New content; omit to keep existing.'),
  tags: z.array(z.string()).optional().describe('New tags (replaces all existing); omit to keep existing.'),
})

export const manageMemoryTool = tool({
  description:
    'Create, list, read, update, or delete persistent memories about the user. '
    + 'Use "list" to retrieve all memories (for reviewing or reorganizing). '
    + 'Use "create" to save new memories (preferences, project details, lessons). '
    + 'Use "read" to search by natural language query and/or tags. '
    + 'Use "update" to change a single memory\'s content and/or tags. '
    + 'Use "batch_update" to update multiple memories at once (reorganize tags, merge content, etc.). '
    + 'Use "delete" to remove memories by ID. '
    + 'Tags MUST use hierarchical multi-level format with "/" separator (at least 2 levels). '
    + 'Good: "preference/food/snacks", "project/my-app/stack". '
    + 'Bad: "food", "preference" (too broad, missing subcategory).',
  inputSchema: z.object({
    action: z.enum(['list', 'create', 'read', 'update', 'batch_update', 'delete']).describe(
      'The action to perform: "list" to retrieve all memories, "create" to save new memories, "read" to search, '
      + '"update" to modify one memory, "batch_update" to modify multiple memories at once, "delete" to remove.',
    ),
    memories: z.array(memoryItemSchema).optional().describe(
      'Required for "create". Array of memories to create.',
    ),
    query: z.string().optional().describe(
      'For "read". Natural language search query. Uses semantic vector search.',
    ),
    tags: z.array(z.string()).optional().describe(
      'For "read": filter by tag names (prefix matching, e.g. "preference" matches all preference/* tags). '
      + 'For "update": new tags (replaces all existing). '
      + 'Use hierarchical multi-level format e.g. ["preference/tools/editor", "project/locus-agent/stack"].',
    ),
    memory_id: z.string().optional().describe(
      'Required for "update". ID of the memory to update (from a prior read result).',
    ),
    content: z.string().optional().describe(
      'For "update". New content; omit to keep existing.',
    ),
    updates: z.array(batchUpdateItemSchema).optional().describe(
      'Required for "batch_update". Array of updates to apply to multiple memories. '
      + 'Use this to reorganize tags, refine content, or batch-fix categorization across memories.',
    ),
    memory_ids: z.array(z.string()).optional().describe(
      'Required for "delete". IDs of memories to delete (from a prior read result).',
    ),
    page: z.number().int().min(1).optional().describe(
      'For "list". Page number (1-based). Defaults to 1.',
    ),
    page_size: z.number().int().min(1).max(50).optional().describe(
      'For "list". Number of memories per page (1-50). Defaults to 20.',
    ),
  }),
})

/** Input type for executeManageMemory (matches tool inputSchema). */
export type ManageMemoryInput
  = | { action: 'list', page?: number, page_size?: number }
    | { action: 'create', memories: { content: string, tags: string[] }[] }
    | { action: 'read', query?: string, tags?: string[] }
    | { action: 'update', memory_id: string, content?: string, tags?: string[] }
    | { action: 'batch_update', updates: { memory_id: string, content?: string, tags?: string[] }[] }
    | { action: 'delete', memory_ids: string[] }

/** Result for list */
export interface ManageMemoryListResult {
  action: 'list'
  memories: { id: string, content: string, tags: string[], updatedAt: string }[]
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
}

/** Result for create */
export interface ManageMemoryCreateResult {
  action: 'create'
  created: { id: string, content: string, tags: string[] }[]
  totalCreated: number
}

/** Result for read */
export interface ManageMemoryReadResult {
  action: 'read'
  memories: { id: string, content: string, tags: string[], updatedAt: string }[]
  totalFound: number
}

/** Result for update */
export interface ManageMemoryUpdateResult {
  action: 'update'
  updated: { id: string, content: string, tags: string[] } | null
  error?: string
}

/** Result for batch_update */
export interface ManageMemoryBatchUpdateResult {
  action: 'batch_update'
  updated: { id: string, content: string, tags: string[] }[]
  failed: { id: string, reason: string }[]
  totalUpdated: number
}

/** Result for delete */
export interface ManageMemoryDeleteResult {
  action: 'delete'
  deleted: string[]
  failed: { id: string, reason: string }[]
  totalDeleted: number
}

export type ManageMemoryResult
  = | ManageMemoryListResult
    | ManageMemoryCreateResult
    | ManageMemoryReadResult
    | ManageMemoryUpdateResult
    | ManageMemoryBatchUpdateResult
    | ManageMemoryDeleteResult

async function runRead(args: { query?: string, tags?: string[] }): Promise<ManageMemoryReadResult> {
  const hasQuery = !!args.query?.trim()
  const hasTags = !!args.tags?.length

  let results: NoteWithTags[]

  if (hasQuery && hasTags) {
    const [byQuery, byTags] = await Promise.all([
      searchNotesHybrid(args.query!.trim()),
      searchNotesByTags(args.tags!),
    ])
    const seen = new Set<string>()
    results = []
    for (const n of byQuery) {
      if (!seen.has(n.id)) {
        seen.add(n.id)
        results.push(n)
      }
    }
    for (const n of byTags) {
      if (!seen.has(n.id)) {
        seen.add(n.id)
        results.push(n)
      }
    }
  }
  else if (hasQuery) {
    results = await searchNotesHybrid(args.query!.trim())
  }
  else if (hasTags) {
    results = await searchNotesByTags(args.tags!)
  }
  else {
    return { action: 'read', memories: [], totalFound: 0 }
  }

  const capped = results.slice(0, 20)
  return {
    action: 'read',
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
 * Execute manage_memory: dispatches by action (create / read / update / delete).
 *
 * @param args - Tool arguments (discriminated by action)
 * @param conversationId - Optional conversation ID for create provenance
 * @param workspacePath - Optional workspace path for workspace-scoped memories
 */
export async function executeManageMemory(
  args: ManageMemoryInput,
  conversationId?: string,
  workspacePath?: string,
): Promise<ManageMemoryResult> {
  switch (args.action) {
    case 'list': {
      const page = args.page ?? 1
      const pageSize = Math.min(args.page_size ?? 20, 50)
      const offset = (page - 1) * pageSize
      // Fetch one extra to determine hasMore
      const results = await listNotes({ limit: pageSize + 1, offset })
      const hasMore = results.length > pageSize
      const pageResults = hasMore ? results.slice(0, pageSize) : results
      return {
        action: 'list',
        memories: pageResults.map(n => ({
          id: n.id,
          content: n.content,
          tags: n.tags.map(t => t.name),
          updatedAt: n.updatedAt.toISOString(),
        })),
        page,
        pageSize,
        totalCount: pageResults.length,
        hasMore,
      }
    }
    case 'create': {
      const created: ManageMemoryCreateResult['created'] = []
      for (const mem of args.memories) {
        const note = await createNote({
          content: mem.content,
          tagNames: mem.tags,
          conversationId,
          workspacePath: workspacePath || null,
        })
        created.push({
          id: note.id,
          content: note.content,
          tags: note.tags.map(t => t.name),
        })
      }
      return { action: 'create', created, totalCreated: created.length }
    }
    case 'read':
      return runRead(args)
    case 'update': {
      const updatePayload: { content?: string, tagNames?: string[] } = {}
      if (args.content !== undefined)
        updatePayload.content = args.content
      if (args.tags !== undefined)
        updatePayload.tagNames = args.tags
      const updated = await updateNote(args.memory_id, updatePayload)
      if (!updated)
        return { action: 'update', updated: null, error: 'Memory not found or already deleted.' }
      return {
        action: 'update',
        updated: {
          id: updated.id,
          content: updated.content,
          tags: updated.tags.map(t => t.name),
        },
      }
    }
    case 'batch_update': {
      const updated: ManageMemoryBatchUpdateResult['updated'] = []
      const failed: ManageMemoryBatchUpdateResult['failed'] = []
      for (const item of args.updates) {
        const payload: { content?: string, tagNames?: string[] } = {}
        if (item.content !== undefined)
          payload.content = item.content
        if (item.tags !== undefined)
          payload.tagNames = item.tags
        const result = await updateNote(item.memory_id, payload)
        if (result) {
          updated.push({
            id: result.id,
            content: result.content,
            tags: result.tags.map(t => t.name),
          })
        }
        else {
          failed.push({ id: item.memory_id, reason: 'Not found or already deleted' })
        }
      }
      return { action: 'batch_update', updated, failed, totalUpdated: updated.length }
    }
    case 'delete': {
      const deleted: string[] = []
      const failed: { id: string, reason: string }[] = []
      for (const id of args.memory_ids) {
        const ok = await deleteNote(id)
        if (ok)
          deleted.push(id)
        else
          failed.push({ id, reason: 'Not found or already deleted' })
      }
      return { action: 'delete', deleted, failed, totalDeleted: deleted.length }
    }
    default: {
      const _: never = args
      return _ as never
    }
  }
}

/**
 * Format ManageMemoryResult into a string for the LLM.
 */
export function formatManageMemoryResult(result: ManageMemoryResult): string {
  switch (result.action) {
    case 'list': {
      if (result.totalCount === 0 && result.page === 1)
        return 'No memories stored yet.'
      if (result.totalCount === 0)
        return `Page ${result.page}: no more memories.`
      const header = `Memories (page ${result.page}, ${result.totalCount} shown${result.hasMore ? ', more available — use next page' : ', this is the last page'}):`
      const lines = [header]
      for (const m of result.memories) {
        const tagStr = m.tags.length > 0 ? ` [${m.tags.map(t => `#${t}`).join(', ')}]` : ''
        lines.push(`- (id: ${m.id}) "${m.content}"${tagStr}`)
      }
      return lines.join('\n')
    }
    case 'create':
      if (result.totalCreated === 0)
        return 'No memories were created.'
      {
        const lines = [`Created ${result.totalCreated} memory(ies):`]
        for (const m of result.created) {
          const tagStr = m.tags.length > 0 ? ` [${m.tags.map(t => `#${t}`).join(', ')}]` : ''
          lines.push(`- (id: ${m.id}) "${m.content}"${tagStr}`)
        }
        return lines.join('\n')
      }
    case 'read':
      if (result.totalFound === 0)
        return 'No memories found matching the search criteria.'
      {
        const lines: string[] = []
        if (result.totalFound > result.memories.length)
          lines.push(`Found ${result.totalFound} memories (showing top ${result.memories.length}):`)
        else
          lines.push(`Found ${result.totalFound} memory(ies):`)
        for (const m of result.memories) {
          const tagStr = m.tags.length > 0 ? ` [${m.tags.map(t => `#${t}`).join(', ')}]` : ''
          lines.push(`- (id: ${m.id}) "${m.content}"${tagStr}`)
        }
        return lines.join('\n')
      }
    case 'update':
      if (!result.updated)
        return result.error ?? 'Update failed.'
      {
        const tagStr = result.updated.tags.length > 0 ? ` [${result.updated.tags.map(t => `#${t}`).join(', ')}]` : ''
        return `Updated memory (id: ${result.updated.id}): "${result.updated.content}"${tagStr}`
      }
    case 'batch_update': {
      const lines: string[] = []
      if (result.totalUpdated > 0) {
        lines.push(`Updated ${result.totalUpdated} memory(ies):`)
        for (const m of result.updated) {
          const tagStr = m.tags.length > 0 ? ` [${m.tags.map(t => `#${t}`).join(', ')}]` : ''
          lines.push(`- (id: ${m.id}) "${m.content}"${tagStr}`)
        }
      }
      if (result.failed.length > 0)
        lines.push(`Failed to update ${result.failed.length}: ${result.failed.map(f => `${f.id} (${f.reason})`).join(', ')}`)
      return lines.length ? lines.join('\n') : 'No updates were provided.'
    }
    case 'delete': {
      const lines: string[] = []
      if (result.totalDeleted > 0)
        lines.push(`Deleted ${result.totalDeleted} memory(ies).`)
      if (result.failed.length > 0)
        lines.push(`Failed to delete ${result.failed.length} (not found or already deleted): ${result.failed.map(f => f.id).join(', ')}`)
      return lines.length ? lines.join('\n') : 'No memory IDs were provided.'
    }
  }
}
