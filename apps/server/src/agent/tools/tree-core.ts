import { readdir, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { getGitignoreFilter } from './gitignore-filter.js'
import { resolveToolPath } from './resolve-path.js'
import { getWorkspaceRoot } from './workspace-root.js'

const DEFAULT_MAX_DEPTH = 3
const DEFAULT_MAX_ENTRIES = 300
const HARD_MAX_DEPTH = 8
const HARD_MAX_ENTRIES = 2000

export interface TreeResult {
  rootPath: string
  maxDepth: number
  maxEntries: number
  shownEntries: number
  truncated: boolean
  tree: string
}

interface WalkState {
  shown: number
  truncated: boolean
  maxEntries: number
}

function shouldSkipName(name: string, includeHidden: boolean): boolean {
  if (!includeHidden && name.startsWith('.'))
    return true
  return false
}

async function walkTree(
  dirPath: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  includeHidden: boolean,
  isIgnored: (absolutePath: string, isDirectory?: boolean) => boolean,
  state: WalkState,
  lines: string[],
): Promise<void> {
  if (state.truncated || depth > maxDepth)
    return

  let entries = await readdir(dirPath, { withFileTypes: true })
  entries = entries
    .filter(entry => !shouldSkipName(entry.name, includeHidden))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory())
        return -1
      if (!a.isDirectory() && b.isDirectory())
        return 1
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })
    })

  for (let i = 0; i < entries.length; i++) {
    if (state.shown >= state.maxEntries) {
      state.truncated = true
      return
    }

    const entry = entries[i]!
    const fullPath = resolve(dirPath, entry.name)
    if (isIgnored(fullPath, entry.isDirectory())) {
      continue
    }
    const isLast = i === entries.length - 1
    const branch = isLast ? '└── ' : '├── '
    const name = entry.isDirectory() ? `${entry.name}/` : entry.name
    lines.push(`${prefix}${branch}${name}`)
    state.shown += 1

    if (entry.isDirectory() && depth < maxDepth) {
      const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`
      await walkTree(fullPath, childPrefix, depth + 1, maxDepth, includeHidden, isIgnored, state, lines)
      if (state.truncated)
        return
    }
  }
}

export async function executeTreeCore(args: {
  path?: string
  max_depth?: number
  max_entries?: number
  include_hidden?: boolean
}): Promise<TreeResult> {
  const maxDepth = Math.min(args.max_depth ?? DEFAULT_MAX_DEPTH, HARD_MAX_DEPTH)
  const maxEntries = Math.min(args.max_entries ?? DEFAULT_MAX_ENTRIES, HARD_MAX_ENTRIES)
  const includeHidden = args.include_hidden ?? false
  const rootPath = args.path ? resolveToolPath(args.path) : getWorkspaceRoot()
  const workspaceRoot = getWorkspaceRoot()
  const isIgnored = await getGitignoreFilter(workspaceRoot)

  const rootStat = await stat(rootPath)
  if (!rootStat.isDirectory()) {
    throw new Error(`Not a directory: ${rootPath}`)
  }

  const lines: string[] = [`${basename(rootPath) || rootPath}/`]
  const state: WalkState = { shown: 0, truncated: false, maxEntries }

  await walkTree(rootPath, '', 0, maxDepth, includeHidden, isIgnored, state, lines)

  return {
    rootPath,
    maxDepth,
    maxEntries,
    shownEntries: state.shown,
    truncated: state.truncated,
    tree: lines.join('\n'),
  }
}

export function formatTreeResult(result: TreeResult): string {
  const lines: string[] = [
    `Tree for ${result.rootPath} (depth<=${result.maxDepth}, entries<=${result.maxEntries})`,
    '',
    result.tree,
  ]

  if (result.truncated) {
    lines.push('')
    lines.push(`[Truncated] Showing ${result.shownEntries} entries. Narrow path or increase max_entries.`)
  }

  return lines.join('\n')
}
