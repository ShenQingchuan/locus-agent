import type { NoteWithTags } from '../../services/note.js'
import { tool } from 'ai'
import { z } from 'zod'
import {
  createNote,
  deleteNote,
  searchNotesByTags,
  searchNotesHybrid,
  updateNote,
} from '../../services/note.js'

const memoryItemSchema = z.object({
  content: z.string().describe('The memory content, 1-3 sentences. Be specific and factual.'),
  tags: z.array(z.string()).describe(
    'Tags for categorization. Use multi-level format with "/" separator, '
    + 'e.g. ["preference/tools", "project/locus-agent"]. '
    + 'Common top-level tags: preference, project, lesson, fact.',
  ),
})

/**
 * manage_memory tool definition.
 *
 * Single tool for CRUD on persistent memories (notes with tags).
 * Supports create, read (search), update (content and/or tags), delete.
 */
export const manageMemoryTool = tool({
  description:
    'Create, read, update, or delete persistent memories about the user. '
    + 'Use "create" to save new memories (preferences, project details, lessons). '
    + 'Use "read" to search by natural language query and/or tags. '
    + 'Use "update" to change a memory\'s content and/or tags (pass memory_id from a prior read). '
    + 'Use "delete" to remove memories by ID. '
    + 'Tags use multi-level format like "preference/code-style", "project/my-app".',
  inputSchema: z.object({
    action: z.enum(['create', 'read', 'update', 'delete']).describe(
      'The action to perform: "create" to save new memories, "read" to search, "update" to modify, "delete" to remove.',
    ),
    memories: z.array(memoryItemSchema).optional().describe(
      'Required for "create". Array of memories to create.',
    ),
    query: z.string().optional().describe(
      'For "read". Natural language search query. Uses semantic vector search.',
    ),
    tags: z.array(z.string()).optional().describe(
      'For "read": filter by tag names (prefix matching). '
      + 'For "update": new tags (replaces all existing). '
      + 'Use multi-level format e.g. ["preference/tools", "project/locus-agent"].',
    ),
    memory_id: z.string().optional().describe(
      'Required for "update". ID of the memory to update (from a prior read result).',
    ),
    content: z.string().optional().describe(
      'For "update". New content; omit to keep existing.',
    ),
    memory_ids: z.array(z.string()).optional().describe(
      'Required for "delete". IDs of memories to delete (from a prior read result).',
    ),
  }),
})

/** Input type for executeManageMemory (matches tool inputSchema). */
export type ManageMemoryInput
  = | { action: 'create', memories: { content: string, tags: string[] }[] }
    | { action: 'read', query?: string, tags?: string[] }
    | { action: 'update', memory_id: string, content?: string, tags?: string[] }
    | { action: 'delete', memory_ids: string[] }

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

/** Result for delete */
export interface ManageMemoryDeleteResult {
  action: 'delete'
  deleted: string[]
  failed: { id: string, reason: string }[]
  totalDeleted: number
}

export type ManageMemoryResult
  = | ManageMemoryCreateResult
    | ManageMemoryReadResult
    | ManageMemoryUpdateResult
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
  else {
    results = await searchNotesByTags(args.tags!)
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
