import type { MentionSearchEntry, WorkspaceDirectoryEntry, WorkspaceTreeNode } from '@univedge/locus-agent-sdk'
import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { Glob } from 'bun'
import { getGitignoreFilter } from '../agent/tools/gitignore-filter.js'
import { getAllowedRoots, resolveAllowedDirectory } from './workspace-access.js'

const MAX_LIST_ENTRIES = 1200
const MAX_TREE_NODES = 8000
const MAX_TREE_DEPTH = 12

const MAX_MENTION_ENTRIES = 200
const MAX_FUZZY_SCAN = 15000
const HIDDEN_DIR_RE = /^\./
const LEADING_SLASH_RE = /^\//

export function sortDirentNames(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
}

export async function getWorkspaceRoots(): Promise<{
  roots: Array<{ name: string, path: string }>
  defaultPath: string
}> {
  const roots = await getAllowedRoots()
  let homePath = ''
  try {
    homePath = await realpath(homedir())
  }
  catch {
    homePath = ''
  }

  const defaultPath = roots.find(path => path === homePath) || roots[0] || ''

  return {
    roots: roots.map(path => ({
      name: basename(path) || path,
      path,
    })),
    defaultPath,
  }
}

export async function listWorkspaceDirectories(
  path: string | undefined,
): Promise<{
  path: string
  entries: WorkspaceDirectoryEntry[]
  truncated: boolean
}> {
  const directoryPath = await resolveAllowedDirectory(path)
  const dirents = await readdir(directoryPath, { withFileTypes: true })

  const directories = dirents
    .filter(entry => entry.isDirectory())
    .map((entry): WorkspaceDirectoryEntry => ({
      name: entry.name,
      path: join(directoryPath, entry.name),
      hasChildren: true,
    }))
    .sort((a, b) => sortDirentNames(a.name, b.name))

  const truncated = directories.length > MAX_LIST_ENTRIES
  const entries = truncated ? directories.slice(0, MAX_LIST_ENTRIES) : directories

  return {
    path: directoryPath,
    entries,
    truncated,
  }
}

async function buildWorkspaceTreeInternal(
  rootPath: string,
  currentPath: string,
  depth: number,
  state: { count: number, truncated: boolean },
): Promise<WorkspaceTreeNode[]> {
  if (state.count >= MAX_TREE_NODES || depth > MAX_TREE_DEPTH) {
    if (state.count >= MAX_TREE_NODES) {
      state.truncated = true
    }
    return []
  }

  const dirents = await readdir(currentPath, { withFileTypes: true })

  const directories = dirents
    .filter(entry => entry.isDirectory())
    .sort((a, b) => sortDirentNames(a.name, b.name))

  const files = dirents
    .filter(entry => entry.isFile())
    .sort((a, b) => sortDirentNames(a.name, b.name))

  const result: WorkspaceTreeNode[] = []

  for (const entry of [...directories, ...files]) {
    if (state.count >= MAX_TREE_NODES) {
      state.truncated = true
      break
    }

    const fullPath = join(currentPath, entry.name)
    const relativePath = relative(rootPath, fullPath).split(sep).join('/')

    if (!relativePath) {
      continue
    }

    state.count += 1

    if (entry.isDirectory()) {
      const children = await buildWorkspaceTreeInternal(rootPath, fullPath, depth + 1, state)
      result.push({
        id: relativePath,
        label: entry.name,
        type: 'directory',
        children,
      })
      continue
    }

    result.push({
      id: relativePath,
      label: entry.name,
      type: 'file',
    })
  }

  return result
}

export async function getWorkspaceTree(
  path: string | undefined,
): Promise<{
  rootPath: string
  rootName: string
  tree: WorkspaceTreeNode[]
  scannedCount: number
  truncated: boolean
}> {
  const rootPath = await resolveAllowedDirectory(path)
  const state = { count: 0, truncated: false }
  const tree = await buildWorkspaceTreeInternal(rootPath, rootPath, 0, state)

  return {
    rootPath,
    rootName: basename(rootPath) || rootPath,
    tree,
    scannedCount: state.count,
    truncated: state.truncated,
  }
}

/** Fuzzy match: query chars appear in order in path (case-insensitive). */
function fuzzyMatch(query: string, path: string): boolean {
  const q = query.toLowerCase()
  const p = path.toLowerCase()
  let j = 0
  for (let i = 0; i < q.length; i++) {
    const found = p.indexOf(q[i], j)
    if (found === -1)
      return false
    j = found + 1
  }
  return true
}

export async function searchMentions(
  query: string,
  basePath: string | undefined,
  includeHidden: boolean,
): Promise<{
  basePath: string
  resolvedDir: string
  entries: MentionSearchEntry[]
  truncated: boolean
}> {
  let resolvedBase: string
  if (basePath) {
    resolvedBase = await resolveAllowedDirectory(basePath)
  }
  else {
    resolvedBase = await realpath(homedir())
  }

  const filter = query.toLowerCase().replace(LEADING_SLASH_RE, '')
  const raw: MentionSearchEntry[] = []

  if (filter) {
    const glob = new Glob('**/*')
    const isIgnored = await getGitignoreFilter(resolvedBase)
    let scanned = 0

    for await (const relPath of glob.scan({
      cwd: resolvedBase,
      dot: includeHidden,
      onlyFiles: false,
      followSymlinks: false,
    })) {
      if (++scanned > MAX_FUZZY_SCAN)
        break
      if (relPath.includes('node_modules'))
        continue
      if (!fuzzyMatch(filter, relPath))
        continue
      const absPath = resolve(resolvedBase, relPath)
      let st: Awaited<ReturnType<typeof stat>>
      try {
        st = await stat(absPath)
      }
      catch {
        continue
      }
      if (isIgnored(absPath, st.isDirectory()))
        continue
      raw.push({
        name: basename(relPath),
        absolutePath: absPath,
        relativePath: relative(resolvedBase, absPath).split(sep).join('/'),
        type: st.isDirectory() ? 'directory' : 'file',
      })
      if (raw.length >= MAX_MENTION_ENTRIES * 2)
        break
    }

    raw.sort((a, b) => {
      if (a.type !== b.type)
        return a.type === 'directory' ? -1 : 1
      const lenA = a.relativePath.length
      const lenB = b.relativePath.length
      if (lenA !== lenB)
        return lenA - lenB
      return sortDirentNames(a.name, b.name)
    })
  }
  else {
    let dirents: import('node:fs').Dirent[]
    try {
      dirents = await readdir(resolvedBase, { withFileTypes: true, encoding: 'utf-8' })
    }
    catch {
      return { basePath: resolvedBase, resolvedDir: resolvedBase, entries: [], truncated: false }
    }

    for (const entry of dirents) {
      if (!includeHidden && HIDDEN_DIR_RE.test(entry.name))
        continue
      if (entry.name === 'node_modules')
        continue
      const absPath = join(resolvedBase, entry.name)
      raw.push({
        name: entry.name,
        absolutePath: absPath,
        relativePath: relative(resolvedBase, absPath).split(sep).join('/'),
        type: entry.isDirectory() ? 'directory' : 'file',
      })
    }

    raw.sort((a, b) => {
      if (a.type !== b.type)
        return a.type === 'directory' ? -1 : 1
      return sortDirentNames(a.name, b.name)
    })
  }

  const truncated = raw.length > MAX_MENTION_ENTRIES
  const entries = truncated ? raw.slice(0, MAX_MENTION_ENTRIES) : raw

  return { basePath: resolvedBase, resolvedDir: resolvedBase, entries, truncated }
}
