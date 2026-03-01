import type {
  WorkspaceDirectoryEntry,
  WorkspaceTreeNode,
} from '@locus-agent/shared'
import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { Hono } from 'hono'

export const workspaceRoutes = new Hono()

const IGNORED_DIR_NAMES = new Set([
  '.git',
  '.idea',
  '.vscode',
  'node_modules',
  'dist',
  '.next',
  '.nuxt',
  '.turbo',
  '.pnpm-store',
  '.cache',
])

const MAX_LIST_ENTRIES = 1200
const MAX_TREE_NODES = 8000
const MAX_TREE_DEPTH = 12

function isWithinRoot(targetPath: string, rootPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${sep}`)
}

async function getAllowedRoots(): Promise<string[]> {
  const candidates = [
    process.cwd(),
    join(homedir(), 'workspace'),
    join(homedir(), 'projects'),
    homedir(),
  ]

  const resolved = await Promise.all(candidates.map(async (path) => {
    try {
      return await realpath(path)
    }
    catch {
      return null
    }
  }))

  return Array.from(new Set(resolved.filter((path): path is string => !!path)))
}

async function resolveAllowedDirectory(inputPath: string | undefined): Promise<string> {
  if (!inputPath) {
    throw new Error('Missing path query parameter')
  }

  const candidate = resolve(inputPath)
  const normalized = await realpath(candidate)
  const allowedRoots = await getAllowedRoots()

  if (!allowedRoots.some(root => isWithinRoot(normalized, root))) {
    throw new Error('Path is outside allowed workspace roots')
  }

  const dirents = await readdir(normalized, { withFileTypes: true })
  if (!dirents) {
    throw new Error('Path is not a readable directory')
  }

  return normalized
}

function sortDirentNames(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base', numeric: true })
}

workspaceRoutes.get('/roots', async (c) => {
  const roots = await getAllowedRoots()
  let homePath = ''
  try {
    homePath = await realpath(homedir())
  }
  catch {
    homePath = ''
  }

  const defaultPath = roots.find(path => path === homePath) || roots[0] || ''

  return c.json({
    roots: roots.map(path => ({
      name: basename(path) || path,
      path,
    })),
    defaultPath,
  })
})

workspaceRoutes.get('/list', async (c) => {
  try {
    const path = c.req.query('path')
    const directoryPath = await resolveAllowedDirectory(path)
    const dirents = await readdir(directoryPath, { withFileTypes: true })

    const directories = dirents
      .filter(entry => entry.isDirectory())
      .filter(entry => !IGNORED_DIR_NAMES.has(entry.name))
      .map((entry): WorkspaceDirectoryEntry => ({
        name: entry.name,
        path: join(directoryPath, entry.name),
        hasChildren: true,
      }))
      .sort((a, b) => sortDirentNames(a.name, b.name))

    const truncated = directories.length > MAX_LIST_ENTRIES
    const entries = truncated ? directories.slice(0, MAX_LIST_ENTRIES) : directories

    return c.json({
      path: directoryPath,
      entries,
      truncated,
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

async function buildWorkspaceTree(
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
    .filter(entry => !IGNORED_DIR_NAMES.has(entry.name))
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
      const children = await buildWorkspaceTree(rootPath, fullPath, depth + 1, state)
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

workspaceRoutes.get('/tree', async (c) => {
  try {
    const path = c.req.query('path')
    const rootPath = await resolveAllowedDirectory(path)
    const state = { count: 0, truncated: false }
    const tree = await buildWorkspaceTree(rootPath, rootPath, 0, state)

    return c.json({
      rootPath,
      rootName: basename(rootPath) || rootPath,
      tree,
      scannedCount: state.count,
      truncated: state.truncated,
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})
