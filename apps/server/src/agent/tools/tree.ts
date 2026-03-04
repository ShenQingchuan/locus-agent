import { tool } from 'ai'
import { z } from 'zod'
import { executeTreeCore, formatTreeResult } from './tree-core.js'

export const treeTool = tool({
  description: 'Show directory structure as an ASCII tree. Use this before broad file searches to understand project layout.',
  inputSchema: z.object({
    path: z.string().optional().describe('Directory path to inspect (default: workspace root)'),
    max_depth: z.number().int().min(0).optional().describe('Maximum depth to traverse (default: 3, hard max: 8)'),
    max_entries: z.number().int().min(1).optional().describe('Maximum nodes to include (default: 300, hard max: 2000)'),
    include_hidden: z.boolean().optional().describe('Whether to include hidden files/directories (default: false)'),
  }),
})

export async function executeTree(args: {
  path?: string
  max_depth?: number
  max_entries?: number
  include_hidden?: boolean
}) {
  return executeTreeCore(args)
}
export { formatTreeResult }
export type { TreeResult } from './tree-core.js'
