import type { GitChangedFile, GitFileStatus } from '@univedge/locus-agent-sdk'
import { watch as fsWatch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateText } from 'ai'
import { buildCommitMessagePrompt, COMMIT_MESSAGE_SYSTEM_PROMPT } from '../agent/prompts/commit-message.js'
import { createLLMModel } from '../agent/providers/model-factory.js'

const RE_CURLY_BRACES = /[{}]/g
const RE_COMMIT_HASH = /\[[\w/.-]+\s+([a-f0-9]+)\]/

/** Max total diff characters sent to the LLM. ~8 000 chars ≈ 2 000 tokens. */
const MAX_DIFF_CHARS = 8_000
/** Max lines kept per individual file diff before truncation. */
const MAX_LINES_PER_FILE = 80

async function runGit(cwd: string, args: string[]): Promise<{ stdout: string, stderr: string, exitCode: number }> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
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
      filePath = filePath.slice(arrowIndex + 4).replace(RE_CURLY_BRACES, '')
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

export async function getGitStatus(directoryPath: string): Promise<{
  rootPath: string
  isGitRepo: boolean
  files: GitChangedFile[]
  summary: { totalFiles: number, totalAdditions: number, totalDeletions: number }
  unpushedCommits: number
}> {
  if (!await isGitRepo(directoryPath)) {
    return {
      rootPath: directoryPath,
      isGitRepo: false,
      files: [],
      summary: { totalFiles: 0, totalAdditions: 0, totalDeletions: 0 },
      unpushedCommits: 0,
    }
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

  return {
    rootPath: directoryPath,
    isGitRepo: true,
    files,
    summary: {
      totalFiles: uniquePaths.size,
      totalAdditions,
      totalDeletions,
    },
    unpushedCommits,
  }
}

export async function getGitDiff(
  directoryPath: string,
  file: string | null,
  staged: string | null,
): Promise<{ filePath: string | null, patch: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { filePath: file || null, patch: '' }
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
      return { filePath: file, patch }
    }

    // Staged diff: index vs HEAD
    if (staged === 'true') {
      const { stdout: patch } = await runGit(directoryPath, ['diff', '--cached', '--', file])
      return { filePath: file, patch }
    }
    // Unstaged diff: working tree vs index
    if (staged === 'false') {
      const { stdout: patch } = await runGit(directoryPath, ['diff', '--', file])
      return { filePath: file, patch }
    }

    // Default: all changes vs HEAD
    const { stdout: patch } = await runGit(directoryPath, ['diff', 'HEAD', '--', file])
    return { filePath: file, patch }
  }

  // Full diff
  const { stdout: patch } = await runGit(directoryPath, ['diff', 'HEAD'])
  return { filePath: null, patch }
}

export async function stageFiles(
  directoryPath: string,
  filePaths: string[],
): Promise<{ success: boolean, message?: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { success: false, message: 'Not a git repository' }
  }

  const args = filePaths.length > 0
    ? ['add', '--', ...filePaths]
    : ['add', '-A']
  const result = await runGit(directoryPath, args)
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr || 'Failed to stage' }
  }

  return { success: true }
}

export async function unstageFiles(
  directoryPath: string,
  filePaths: string[],
): Promise<{ success: boolean, message?: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { success: false, message: 'Not a git repository' }
  }

  const args = filePaths.length > 0
    ? ['reset', 'HEAD', '--', ...filePaths]
    : ['reset', 'HEAD']
  const result = await runGit(directoryPath, args)
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr || 'Failed to unstage' }
  }

  return { success: true }
}

export async function commitChanges(
  directoryPath: string,
  message: string,
  filePaths?: string[],
): Promise<{ success: boolean, message?: string, commitHash?: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { success: false, message: 'Not a git repository' }
  }

  // If filePaths provided, stage them first; otherwise commit what's already staged
  if (filePaths && filePaths.length > 0) {
    const addResult = await runGit(directoryPath, ['add', '--', ...filePaths])
    if (addResult.exitCode !== 0) {
      return { success: false, message: addResult.stderr || 'Failed to stage changes' }
    }
  }

  // Commit
  const commitResult = await runGit(directoryPath, ['commit', '-m', message])
  if (commitResult.exitCode !== 0) {
    return { success: false, message: commitResult.stderr || 'Failed to commit' }
  }

  // Extract commit hash from output (e.g., "[main abc1234] message")
  const hashMatch = commitResult.stdout.match(RE_COMMIT_HASH)
  return {
    success: true,
    commitHash: hashMatch?.[1],
    message: commitResult.stdout.split('\n')[0],
  }
}

export function createGitWatchStream(directoryPath: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  let cleanupFn: (() => void) | null = null

  return new ReadableStream<Uint8Array>({
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
        debounceTimer = setTimeout(send, 300, 'changed')
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
      const keepalive = setInterval(send, 30_000, 'keepalive')

      function cleanup() {
        gitWatcher?.close()
        refsWatcher?.close()
        workspaceWatcher?.close()
        clearInterval(keepalive)
        if (debounceTimer)
          clearTimeout(debounceTimer)
      }

      cleanupFn = cleanup
    },
    cancel() {
      cleanupFn?.()
    },
  })
}

export async function pushGitRepo(
  directoryPath: string,
): Promise<{ success: boolean, message?: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { success: false, message: 'Not a git repository' }
  }

  const result = await runGit(directoryPath, ['push'])
  if (result.exitCode !== 0) {
    return { success: false, message: result.stderr || 'Failed to push' }
  }

  return { success: true, message: result.stderr || result.stdout || 'Push successful' }
}

export async function discardChanges(
  directoryPath: string,
  filePaths: string[],
): Promise<{ success: boolean, message?: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { success: false, message: 'Not a git repository' }
  }

  if (filePaths.length === 0) {
    // Discard all changes
    await runGit(directoryPath, ['checkout', '.'])
    await runGit(directoryPath, ['clean', '-fd'])
  }
  else {
    // Discard specific files
    for (const filePath of filePaths) {
      const { stdout: statusOut } = await runGit(directoryPath, ['status', '--porcelain', '--', filePath])
      if (statusOut.trimStart().startsWith('??')) {
        await runGit(directoryPath, ['clean', '-f', '--', filePath])
      }
      else {
        await runGit(directoryPath, ['checkout', 'HEAD', '--', filePath])
      }
    }
  }

  return { success: true, message: 'Changes discarded' }
}

const RE_DIFF_GIT = /(?=^diff --git )/m
function trimDiffForLLM(stat: string, fullDiff: string): string {
  const header = stat.trim()
  if (!fullDiff.trim()) {
    return header
  }

  // Split into per-file patches (each starts with "diff --git ...")
  const patches = fullDiff.split(RE_DIFF_GIT)
  const parts: string[] = [header, '']
  let totalChars = header.length

  for (const patch of patches) {
    if (!patch.trim())
      continue

    const lines = patch.split('\n')
    let trimmed: string
    if (lines.length > MAX_LINES_PER_FILE) {
      const kept = lines.slice(0, MAX_LINES_PER_FILE)
      trimmed = `${kept.join('\n')}\n[… ${lines.length - MAX_LINES_PER_FILE} more lines truncated]`
    }
    else {
      trimmed = patch
    }

    if (totalChars + trimmed.length > MAX_DIFF_CHARS) {
      parts.push('[… remaining file diffs omitted due to size limit]')
      break
    }

    parts.push(trimmed)
    totalChars += trimmed.length
  }

  return parts.join('\n')
}

export async function suggestCommitMessage(
  directoryPath: string,
): Promise<{ message: string } | { error: string }> {
  if (!await isGitRepo(directoryPath)) {
    return { error: 'Not a git repository' }
  }

  // Run stat + full staged diff in parallel
  const [statResult, diffResult] = await Promise.all([
    runGit(directoryPath, ['diff', '--cached', '--stat']),
    runGit(directoryPath, ['diff', '--cached']),
  ])

  if (!statResult.stdout.trim() && !diffResult.stdout.trim()) {
    return { error: 'No staged changes to generate a message for' }
  }

  const diffContext = trimDiffForLLM(statResult.stdout, diffResult.stdout)

  const model = createLLMModel({ thinkingMode: false })
  const result = await generateText({
    model,
    maxOutputTokens: 1024,
    system: COMMIT_MESSAGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildCommitMessagePrompt(diffContext) }],
    providerOptions: {
      anthropic: { thinking: { type: 'disabled' } },
      moonshotai: { thinking: { type: 'disabled' } },
      deepseek: { thinking: { type: 'disabled' } },
    },
  })

  return { message: result.text.trim() }
}
