import type { TagWithCount } from '@locus-agent/agent-sdk'
import type { TreeNode } from '@locus-agent/ui'

/**
 * Data attached to each tree node for tag display.
 * - `tagId`: the actual tag ID (only on leaf nodes that map to a real tag)
 * - `noteCount`: aggregated count (own notes + children's notes)
 */
export interface TagTreeData {
  /** Real tag ID — null for virtual parent nodes that don't exist as a tag */
  tagId: string | null
  /** Total note count (own + descendants) */
  noteCount: number
  /** This node's own note count (0 for virtual parents) */
  ownNoteCount: number
}

interface IntermediateNode {
  label: string
  fullPath: string
  tagId: string | null
  ownNoteCount: number
  children: Map<string, IntermediateNode>
}

/**
 * Builds a tree structure from a flat list of tags with `/`-separated names.
 *
 * Example:
 *   Input: [{ name: 'preference/code-style', noteCount: 3 }, { name: 'preference/ui', noteCount: 2 }]
 *   Output: TreeNode[] with a "preference" parent (count=5) and two children
 */
export function buildTagTree(tags: TagWithCount[]): TreeNode[] {
  const root = new Map<string, IntermediateNode>()

  for (const tag of tags) {
    const segments = tag.name.split('/')
    let currentLevel = root

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      const fullPath = segments.slice(0, i + 1).join('/')
      const isLeaf = i === segments.length - 1

      let node = currentLevel.get(segment)
      if (!node) {
        node = {
          label: segment,
          fullPath,
          tagId: null,
          ownNoteCount: 0,
          children: new Map(),
        }
        currentLevel.set(segment, node)
      }

      if (isLeaf) {
        node.tagId = tag.id
        node.ownNoteCount = tag.noteCount
      }

      currentLevel = node.children
    }
  }

  return convertToTreeNodes(root)
}

function convertToTreeNodes(level: Map<string, IntermediateNode>): TreeNode[] {
  const result: TreeNode[] = []

  for (const [, node] of level) {
    const children = convertToTreeNodes(node.children)
    const childrenCount = children.reduce(
      (sum, c) => sum + (c.data as TagTreeData).noteCount,
      0,
    )

    const treeNode: TreeNode = {
      id: node.fullPath, // Use full path as unique ID (stable)
      label: node.label,
      data: {
        tagId: node.tagId,
        noteCount: node.ownNoteCount + childrenCount,
        ownNoteCount: node.ownNoteCount,
      } satisfies TagTreeData,
    }

    if (children.length > 0) {
      treeNode.children = children
    }

    result.push(treeNode)
  }

  // Sort: parent-like nodes (with children) first, then alphabetically
  result.sort((a, b) => {
    const aHasChildren = (a.children?.length ?? 0) > 0
    const bHasChildren = (b.children?.length ?? 0) > 0
    if (aHasChildren !== bHasChildren)
      return aHasChildren ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  return result
}
