import type {
  GitChangedFile,
  GitFileStatus,
  WorkspaceDirectoryEntry,
  WorkspaceTreeNode,
} from '@locus-agent/shared'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { Hono } from 'hono'

export const workspaceRoutes = new Hono()

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

// ---------------------------------------------------------------------------
// Git routes
// ---------------------------------------------------------------------------

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const { exitCode } = await runGit(cwd, ['rev-parse', '--is-inside-work-tree'])
  return exitCode === 0
}

function parseStatusLine(line: string): { status: GitFileStatus, filePath: string } | null {
  if (line.length < 4) {
    return null
  }

  const xy = line.slice(0, 2)
  let filePath = line.slice(3)

  // Handle renames: "R  old -> new"
  const arrowIndex = filePath.indexOf(' -> ')
  if (arrowIndex >= 0) {
    filePath = filePath.slice(arrowIndex + 4)
  }

  let status: GitFileStatus
  if (xy === '??') {
    status = '??'
  }
  else if (xy[0] === 'U' || xy[1] === 'U' || xy === 'AA' || xy === 'DD') {
    status = 'U'
  }
  else if (xy[0] === 'R') {
    status = 'R'
  }
  else if (xy[0] === 'A' || xy[1] === 'A') {
    status = 'A'
  }
  else if (xy[0] === 'D' || xy[1] === 'D') {
    status = 'D'
  }
  else {
    status = 'M'
  }

  return { status, filePath }
}

function parseNumstat(output: string): Map<string, { additions: number | null, deletions: number | null }> {
  const map = new Map<string, { additions: number | null, deletions: number | null }>()

  for (const line of output.split('\n')) {
    if (!line.trim()) {
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 3) {
      continue
    }

    const [addStr, delStr, ...pathParts] = parts
    let filePath = pathParts.join('\t')

    // Handle renames: "old => new" or "{old => new}/path"
    const arrowIndex = filePath.indexOf(' => ')
    if (arrowIndex >= 0) {
      // Simplification: take the part after =>
      filePath = filePath.slice(arrowIndex + 4).replace(/[{}]/g, '')
    }

    const additions = addStr === '-' ? null : Number.parseInt(addStr!, 10)
    const deletions = delStr === '-' ? null : Number.parseInt(delStr!, 10)
    map.set(filePath, {
      additions: Number.isNaN(additions!) ? null : additions!,
      deletions: Number.isNaN(deletions!) ? null : deletions!,
    })
  }

  return map
}

workspaceRoutes.get('/git/status', async (c) => {
  try {
    const path = c.req.query('path')
    const directoryPath = await resolveAllowedDirectory(path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({
        rootPath: directoryPath,
        isGitRepo: false,
        files: [],
        summary: { totalFiles: 0, totalAdditions: 0, totalDeletions: 0 },
      })
    }

    const [statusResult, numstatResult, numstatCachedResult] = await Promise.all([
      runGit(directoryPath, ['status', '--porcelain', '-uall']),
      runGit(directoryPath, ['diff', '--numstat', 'HEAD']),
      runGit(directoryPath, ['diff', '--numstat', '--cached', 'HEAD']),
    ])

    // Merge numstat from both staged and unstaged
    const numstatMap = parseNumstat(numstatResult.stdout)
    for (const [filePath, stats] of parseNumstat(numstatCachedResult.stdout)) {
      const existing = numstatMap.get(filePath)
      if (existing) {
        existing.additions = (existing.additions ?? 0) + (stats.additions ?? 0)
        existing.deletions = (existing.deletions ?? 0) + (stats.deletions ?? 0)
      }
      else {
        numstatMap.set(filePath, stats)
      }
    }

    const files: GitChangedFile[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    for (const line of statusResult.stdout.split('\n')) {
      const parsed = parseStatusLine(line)
      if (!parsed) {
        continue
      }

      const stats = numstatMap.get(parsed.filePath)
      const additions = stats?.additions ?? null
      const deletions = stats?.deletions ?? null

      files.push({
        filePath: parsed.filePath,
        status: parsed.status,
        additions,
        deletions,
      })

      if (additions !== null) {
        totalAdditions += additions
      }
      if (deletions !== null) {
        totalDeletions += deletions
      }
    }

    return c.json({
      rootPath: directoryPath,
      isGitRepo: true,
      files,
      summary: {
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
      },
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.get('/git/diff', async (c) => {
  try {
    const path = c.req.query('path')
    const file = c.req.query('file')
    const directoryPath = await resolveAllowedDirectory(path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ filePath: file || null, patch: '' })
    }

    if (file) {
      // Check if the file is untracked
      const { stdout: statusOut } = await runGit(directoryPath, ['status', '--porcelain', '--', file])
      const isUntracked = statusOut.trimStart().startsWith('??')

      if (isUntracked) {
        // Build synthetic all-additions diff for untracked files
        const fullPath = join(directoryPath, file)
        const content = await readFile(fullPath, 'utf-8').catch(() => '')
        const lines = content.split('\n')
        const added = lines.map(l => `+${l}`).join('\n')
        const patch = `--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${added}`
        return c.json({ filePath: file, patch })
      }

      // Tracked file: combine staged + unstaged diff against HEAD
      const { stdout: patch } = await runGit(directoryPath, ['diff', 'HEAD', '--', file])
      return c.json({ filePath: file, patch })
    }

    // Full diff
    const { stdout: patch } = await runGit(directoryPath, ['diff', 'HEAD'])
    return c.json({ filePath: null, patch })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/commit', async (c) => {
  try {
    const body = await c.req.json<{ path: string, message: string }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    // Stage all changes
    const addResult = await runGit(directoryPath, ['add', '-A'])
    if (addResult.exitCode !== 0) {
      return c.json({ success: false, message: addResult.stderr || 'Failed to stage changes' }, 400)
    }

    // Commit
    const commitResult = await runGit(directoryPath, ['commit', '-m', body.message])
    if (commitResult.exitCode !== 0) {
      return c.json({ success: false, message: commitResult.stderr || 'Failed to commit' }, 400)
    }

    // Extract commit hash from output (e.g., "[main abc1234] message")
    const hashMatch = commitResult.stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/)
    return c.json({
      success: true,
      commitHash: hashMatch?.[1],
      message: commitResult.stdout.split('\n')[0],
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/discard', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    if (body.filePaths.length === 0) {
      // Discard all changes
      await runGit(directoryPath, ['checkout', '.'])
      await runGit(directoryPath, ['clean', '-fd'])
    }
    else {
      // Discard specific files
      for (const filePath of body.filePaths) {
        const { stdout: statusOut } = await runGit(directoryPath, ['status', '--porcelain', '--', filePath])
        if (statusOut.trimStart().startsWith('??')) {
          await runGit(directoryPath, ['clean', '-f', '--', filePath])
        }
        else {
          await runGit(directoryPath, ['checkout', 'HEAD', '--', filePath])
        }
      }
    }

    return c.json({ success: true, message: 'Changes discarded' })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})
