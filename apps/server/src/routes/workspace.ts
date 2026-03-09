import type {
  GitChangedFile,
  GitFileStatus,
  WorkspaceDirectoryEntry,
  WorkspaceTreeNode,
} from '@locus-agent/agent-sdk'
import { watch as fsWatch } from 'node:fs'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { Hono } from 'hono'
import { getAllowedRoots, resolveAllowedDirectory } from '../services/workspace-access.js'

export const workspaceRoutes = new Hono()

const MAX_LIST_ENTRIES = 1200
const MAX_TREE_NODES = 8000
const MAX_TREE_DEPTH = 12

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

/**
 * Parse a single `git status --porcelain` line into entries.
 * XY format: X = index (staged) status, Y = working-tree (unstaged) status.
 * A file like `MM` produces TWO entries: one staged, one unstaged.
 */
function parseStatusEntries(line: string): Array<{ status: GitFileStatus, filePath: string, staged: boolean }> {
  if (line.length < 4)
    return []

  const x = line[0]!
  const y = line[1]!
  let filePath = line.slice(3)

  // Handle renames: "R  old -> new"
  const arrowIndex = filePath.indexOf(' -> ')
  if (arrowIndex >= 0) {
    filePath = filePath.slice(arrowIndex + 4)
  }

  const entries: Array<{ status: GitFileStatus, filePath: string, staged: boolean }> = []

  // Untracked
  if (x === '?' && y === '?') {
    entries.push({ status: '??', filePath, staged: false })
    return entries
  }

  // Unmerged/conflict
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    entries.push({ status: 'U', filePath, staged: false })
    return entries
  }

  // Staged change (X is not ' ')
  if (x !== ' ') {
    let status: GitFileStatus = 'M'
    if (x === 'A')
      status = 'A'
    else if (x === 'D')
      status = 'D'
    else if (x === 'R')
      status = 'R'
    entries.push({ status, filePath, staged: true })
  }

  // Unstaged change (Y is not ' ')
  if (y !== ' ') {
    let status: GitFileStatus = 'M'
    if (y === 'D')
      status = 'D'
    entries.push({ status, filePath, staged: false })
  }

  return entries
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
        unpushedCommits: 0,
      })
    }

    const [statusResult, numstatUnstagedResult, numstatStagedResult, aheadResult] = await Promise.all([
      runGit(directoryPath, ['status', '--porcelain', '-uall']),
      runGit(directoryPath, ['diff', '--numstat']), // unstaged: working tree vs index
      runGit(directoryPath, ['diff', '--numstat', '--cached']), // staged: index vs HEAD
      runGit(directoryPath, ['rev-list', '--count', '@{u}..HEAD']), // commits ahead of upstream
    ])

    const unstagedNumstat = parseNumstat(numstatUnstagedResult.stdout)
    const stagedNumstat = parseNumstat(numstatStagedResult.stdout)

    const files: GitChangedFile[] = []
    const uniquePaths = new Set<string>()
    let totalAdditions = 0
    let totalDeletions = 0

    for (const line of statusResult.stdout.split('\n')) {
      for (const entry of parseStatusEntries(line)) {
        const numstat = entry.staged ? stagedNumstat : unstagedNumstat
        const stats = numstat.get(entry.filePath)
        const additions = stats?.additions ?? null
        const deletions = stats?.deletions ?? null

        files.push({
          filePath: entry.filePath,
          status: entry.status,
          staged: entry.staged,
          additions,
          deletions,
        })

        uniquePaths.add(entry.filePath)
        if (additions !== null)
          totalAdditions += additions
        if (deletions !== null)
          totalDeletions += deletions
      }
    }

    // -1 = no upstream tracking branch, 0+ = commits ahead
    const unpushedCommits = aheadResult.exitCode === 0
      ? Number.parseInt(aheadResult.stdout.trim(), 10) || 0
      : -1

    return c.json({
      rootPath: directoryPath,
      isGitRepo: true,
      files,
      summary: {
        totalFiles: uniquePaths.size,
        totalAdditions,
        totalDeletions,
      },
      unpushedCommits,
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
    const staged = c.req.query('staged') // 'true' | 'false' | undefined
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

      // Staged diff: index vs HEAD
      if (staged === 'true') {
        const { stdout: patch } = await runGit(directoryPath, ['diff', '--cached', '--', file])
        return c.json({ filePath: file, patch })
      }
      // Unstaged diff: working tree vs index
      if (staged === 'false') {
        const { stdout: patch } = await runGit(directoryPath, ['diff', '--', file])
        return c.json({ filePath: file, patch })
      }

      // Default: all changes vs HEAD
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

workspaceRoutes.post('/git/stage', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    const args = body.filePaths.length > 0
      ? ['add', '--', ...body.filePaths]
      : ['add', '-A']
    const result = await runGit(directoryPath, args)
    if (result.exitCode !== 0) {
      return c.json({ success: false, message: result.stderr || 'Failed to stage' }, 400)
    }

    return c.json({ success: true })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/unstage', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    const args = body.filePaths.length > 0
      ? ['reset', 'HEAD', '--', ...body.filePaths]
      : ['reset', 'HEAD']
    const result = await runGit(directoryPath, args)
    if (result.exitCode !== 0) {
      return c.json({ success: false, message: result.stderr || 'Failed to unstage' }, 400)
    }

    return c.json({ success: true })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/commit', async (c) => {
  try {
    const body = await c.req.json<{ path: string, message: string, filePaths?: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    // If filePaths provided, stage them first; otherwise commit what's already staged
    if (body.filePaths && body.filePaths.length > 0) {
      const addResult = await runGit(directoryPath, ['add', '--', ...body.filePaths])
      if (addResult.exitCode !== 0) {
        return c.json({ success: false, message: addResult.stderr || 'Failed to stage changes' }, 400)
      }
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

// ---------------------------------------------------------------------------
// Git file watcher — SSE endpoint
// ---------------------------------------------------------------------------

workspaceRoutes.get('/git/watch', async (c) => {
  try {
    const path = c.req.query('path')
    const directoryPath = await resolveAllowedDirectory(path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ error: 'Not a git repository' }, 400)
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        function send(data: string) {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
          catch {
            cleanup()
          }
        }

        function notify() {
          if (debounceTimer)
            clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => send('changed'), 300)
        }

        // Watch .git/ directory for index/HEAD changes (staging, commit, branch switch)
        let gitWatcher: ReturnType<typeof fsWatch> | null = null
        try {
          gitWatcher = fsWatch(join(directoryPath, '.git'), (_, filename) => {
            if (filename === 'index' || filename === 'HEAD' || filename === 'packed-refs')
              notify()
          })
        }
        catch { /* .git dir watch failed, continue with workspace watcher only */ }

        // Watch .git/refs/ recursively for push/fetch/pull (remote tracking ref updates)
        let refsWatcher: ReturnType<typeof fsWatch> | null = null
        try {
          refsWatcher = fsWatch(join(directoryPath, '.git', 'refs'), { recursive: true }, () => {
            notify()
          })
        }
        catch { /* refs watch failed, fallback to staleTime polling */ }

        // Watch workspace recursively for file edits (exclude .git/ internals)
        let workspaceWatcher: ReturnType<typeof fsWatch> | null = null
        try {
          workspaceWatcher = fsWatch(directoryPath, { recursive: true }, (_, filename) => {
            if (filename && !filename.startsWith('.git/') && !filename.startsWith('.git\\'))
              notify()
          })
        }
        catch { /* recursive watch not supported, fallback to no auto-refresh */ }

        // Keepalive to prevent proxy/browser timeout
        const keepalive = setInterval(() => send('keepalive'), 30_000)

        function cleanup() {
          gitWatcher?.close()
          refsWatcher?.close()
          workspaceWatcher?.close()
          clearInterval(keepalive)
          if (debounceTimer)
            clearTimeout(debounceTimer)
        }

        c.req.raw.signal.addEventListener('abort', () => {
          cleanup()
          try {
            controller.close()
          }
          catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/push', async (c) => {
  try {
    const body = await c.req.json<{ path: string }>()
    const directoryPath = await resolveAllowedDirectory(body.path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ success: false, message: 'Not a git repository' }, 400)
    }

    const result = await runGit(directoryPath, ['push'])
    if (result.exitCode !== 0) {
      return c.json({ success: false, message: result.stderr || 'Failed to push' }, 400)
    }

    return c.json({ success: true, message: result.stderr || result.stdout || 'Push successful' })
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
