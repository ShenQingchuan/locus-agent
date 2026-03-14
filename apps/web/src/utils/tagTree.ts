import type { NoteWithTags, TagWithCount } from '@univedge/locus-agent-sdk'
import type { TreeNode } from '@univedge/locus-ui'

/**
 * Data attached to each tree node for tag display.
 * - `tagId`: the actual tag ID (only on leaf nodes that map to a real tag)
 * - `noteCount`: deduplicated count of unique notes under this node
 */
export interface TagTreeData {
  /** Real tag ID — null for virtual parent nodes that don't exist as a tag */
  tagId: string | null
  /** Total note count (unique notes under this node + descendants) */
  noteCount: number
  /** This node's own note count (0 for virtual parents) */
  ownNoteCount: number
}

interface IntermediateNode {
  label: string
  fullPath: string
  tagId: string | null
  ownNoteCount: number
  /** Unique note IDs that have this exact tag */
  noteIds: Set<string>
  children: Map<string, IntermediateNode>
}

/**
 * Collect all unique note IDs from this node and its descendants.
 */
function collectNoteIds(node: IntermediateNode): Set<string> {
  const all = new Set(node.noteIds)
  for (const child of node.children.values()) {
    for (const id of collectNoteIds(child)) {
      all.add(id)
    }
  }
  return all
}

/**
 * Builds a tree structure from a flat list of tags with `/`-separated names.
 * When `notes` are provided, counts unique notes per node (no double-counting).
 * Falls back to `TagWithCount.noteCount` when notes are not available.
 */
export function buildTagTree(tags: TagWithCount[], notes?: NoteWithTags[]): TreeNode[] {
  const root = new Map<string, IntermediateNode>()

  // Build note→tag index for accurate counting
  const tagIdToNoteIds = new Map<string, Set<string>>()
  if (notes) {
    for (const note of notes) {
      for (const tag of note.tags) {
        if (!tagIdToNoteIds.has(tag.id)) {
          tagIdToNoteIds.set(tag.id, new Set())
        }
        tagIdToNoteIds.get(tag.id)!.add(note.id)
      }
    }
  }

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
          noteIds: new Set(),
          children: new Map(),
        }
        currentLevel.set(segment, node)
      }

      if (isLeaf) {
        node.tagId = tag.id
        const ids = tagIdToNoteIds.get(tag.id)
        if (ids) {
          node.ownNoteCount = ids.size
          node.noteIds = ids
        }
        else {
          node.ownNoteCount = tag.noteCount
        }
      }

      currentLevel = node.children
    }
  }

  return convertToTreeNodes(root, !!notes)
}

function convertToTreeNodes(level: Map<string, IntermediateNode>, hasNotes: boolean): TreeNode[] {
  const result: TreeNode[] = []

  for (const [, node] of level) {
    const children = convertToTreeNodes(node.children, hasNotes)

    let totalCount: number
    if (hasNotes) {
      // Deduplicated count from all unique notes under this subtree
      totalCount = collectNoteIds(node).size
    }
    else {
      // Fallback: sum children counts (may double-count)
      const childrenCount = children.reduce(
        (sum, c) => sum + (c.data as TagTreeData).noteCount,
        0,
      )
      totalCount = node.ownNoteCount + childrenCount
    }

    const treeNode: TreeNode = {
      id: node.fullPath,
      label: node.label,
      data: {
        tagId: node.tagId,
        noteCount: totalCount,
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
