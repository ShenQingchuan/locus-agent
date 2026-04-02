/**
 * System & User Context (Node.js only)
 *
 * Builds context for agent system prompts:
 * - Git status injection (branch, commits, status)
 * - CLAUDE.md / AGENT.md project context discovery
 * - Working directory info
 */

import { execSync } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

let cachedGitStatus: string | null = null
let cachedGitStatusCwd: string | null = null

/** Get git status info for system prompt injection. Memoized per cwd. */
export async function getGitStatus(cwd: string): Promise<string> {
  if (cachedGitStatus !== null && cachedGitStatusCwd === cwd)
    return cachedGitStatus

  try {
    const git = (cmd: string, timeout = 5000): string | null => {
      try {
        return execSync(cmd, {
          cwd,
          timeout,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
      }
      catch {
        return null
      }
    }

    if (!git('git rev-parse --git-dir'))
      return ''

    const parts: string[] = []

    const branch = git('git rev-parse --abbrev-ref HEAD')
    if (branch)
      parts.push(`Current branch: ${branch}`)

    const mainBranch = detectMainBranch(cwd)
    if (mainBranch)
      parts.push(`Main branch (you will usually use this for PRs): ${mainBranch}`)

    const status = git('git status --short')
    if (status) {
      const truncated = status.length > 2000 ? `${status.slice(0, 2000)}\n...(truncated)` : status
      parts.push(`Status:\n${truncated}`)
    }
    else {
      parts.push('Status:\n(clean)')
    }

    if (git('git rev-parse HEAD')) {
      const log = git('git log --oneline -5 --no-decorate')
      if (log)
        parts.push(`Recent commits:\n${log}`)
    }

    cachedGitStatus = parts.join('\n\n')
    cachedGitStatusCwd = cwd
    return cachedGitStatus
  }
  catch {
    return ''
  }
}

function detectMainBranch(cwd: string): string | null {
  try {
    const branches = execSync('git branch -l main master', {
      cwd,
      timeout: 3000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (branches.includes('main'))
      return 'main'
    if (branches.includes('master'))
      return 'master'
    return null
  }
  catch {
    return null
  }
}

/** Clear the git status memo cache (call at session start). */
export function clearGitStatusCache(): void {
  cachedGitStatus = null
  cachedGitStatusCwd = null
}

// ---------------------------------------------------------------------------
// Project context files
// ---------------------------------------------------------------------------

const CONTEXT_FILE_CANDIDATES = ['CLAUDE.md', 'AGENT.md', '.claude/CLAUDE.md', 'claude.md']

/** Find project context files (CLAUDE.md, AGENT.md) relative to cwd and home. */
export async function discoverProjectContextFiles(cwd: string): Promise<string[]> {
  const candidates = CONTEXT_FILE_CANDIDATES.map(f => join(cwd, f))

  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  if (home)
    candidates.push(join(home, '.claude', 'CLAUDE.md'))

  const found: string[] = []
  for (const path of candidates) {
    try {
      const s = await stat(path)
      if (s.isFile())
        found.push(path)
    }
    catch { /* not found */ }
  }
  return found
}

/** Read and concatenate all discovered project context files. */
export async function readProjectContextContent(cwd: string): Promise<string> {
  const files = await discoverProjectContextFiles(cwd)
  if (files.length === 0)
    return ''

  const parts: string[] = []
  for (const file of files) {
    try {
      const content = await readFile(file, 'utf-8')
      if (content.trim())
        parts.push(`# From ${file}:\n${content.trim()}`)
    }
    catch { /* skip unreadable */ }
  }
  return parts.join('\n\n')
}

// ---------------------------------------------------------------------------
// Composed context builders
// ---------------------------------------------------------------------------

/** Build git status context string for system prompt injection. */
export async function getSystemContext(cwd: string): Promise<string> {
  const gitStatus = await getGitStatus(cwd)
  return gitStatus ? `gitStatus: ${gitStatus}` : ''
}

/** Build user context string (date + project context files). */
export async function getUserContext(cwd: string): Promise<string> {
  const parts: string[] = [
    `# currentDate\nToday's date is ${new Date().toISOString().split('T')[0]}.`,
  ]
  const projectCtx = await readProjectContextContent(cwd)
  if (projectCtx)
    parts.push(projectCtx)
  return parts.join('\n\n')
}
