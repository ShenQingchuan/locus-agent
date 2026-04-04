import type { SkillFileNode } from '@univedge/locus-agent-sdk'
import type { FileTreeNode } from '@univedge/locus-ui'

const RE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontmatter(raw: string): { frontmatter: string, body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n'))
    return { frontmatter: '', body: raw }

  const match = raw.match(RE_FRONTMATTER)
  if (!match)
    return { frontmatter: '', body: raw }

  return {
    frontmatter: match[1] ?? '',
    body: raw.slice(match[0].length).trim(),
  }
}

export function convertToFileTreeNodes(nodes: SkillFileNode[]): FileTreeNode[] {
  return nodes.map(node => ({
    id: node.path,
    label: node.name,
    type: node.type,
    children: node.children ? convertToFileTreeNodes(node.children) : undefined,
  }))
}

export function collectDirectoryIds(nodes: SkillFileNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      ids.push(node.path)
      if (node.children) {
        ids.push(...collectDirectoryIds(node.children))
      }
    }
  }
  return ids
}

export function countFileNodes(nodes: FileTreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file')
      count++
    if (node.children)
      count += countFileNodes(node.children)
  }
  return count
}
