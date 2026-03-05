import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tool } from 'ai'
import { Glob } from 'bun'
import { z } from 'zod'
import { getGitignoreFilter } from './gitignore-filter.js'
import { resolveToolPath } from './resolve-path.js'
import { getWorkspaceRoot } from './workspace-root.js'

/**
 * Maximum number of matching paths returned by default.
 * Prevents token explosion when the pattern matches thousands of files.
 */
const DEFAULT_LIMIT = 200

/**
 * Absolute upper bound even when the caller explicitly sets `limit`.
 */
const HARD_MAX_LIMIT = 5000

/**
 * Glob tool definition (Vercel AI SDK format).
 *
 * Design notes:
 * - This is a **read-only** file discovery tool with risk level `safe`.
 *   It never modifies the filesystem.
 * - Returns matching file paths sorted by modification time (newest first),
 *   so the LLM can quickly focus on recently changed files.
 * - Supports standard glob syntax: `*`, `**`, `?`, `[abc]`, `{a,b}`.
 *
 * Typical use cases:
 * - Find files by extension:  `**\/*.ts`
 * - Find files by name:       `**\/config.*`
 * - Explore directory layout:  `src/**`
 * - Find test files:           `**\/*.{test,spec}.{ts,tsx}`
 */
export const globTool = tool({
  description:
    'Find files matching a glob pattern. '
    + 'Returns file paths sorted by modification time (newest first). '
    + 'Respects .gitignore rules in the workspace root. '
    + 'Use `**/*.ext` for recursive search. Supports `*`, `**`, `?`, `[abc]`, `{a,b}` syntax.',
  inputSchema: z.object({
    pattern: z
      .string()
      .describe('Glob pattern to match files, e.g. "**/*.ts", "src/**/*.vue", "*.json"'),
    cwd: z
      .string()
      .optional()
      .describe('Directory to search in (default: working directory). Absolute or relative path.'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of results to return (default: 200)'),
  }),
})

/**
 * Structured result returned by executeGlob.
 */
export interface GlobResult {
  /** The resolved root directory that was searched */
  cwd: string
  /** The glob pattern used */
  pattern: string
  /** Matching file paths (relative to cwd), sorted by mtime descending */
  files: string[]
  /** Total number of files found before applying limit */
  totalMatches: number
  /** Whether the results were truncated due to the limit */
  truncated: boolean
}

/**
 * Execute the glob tool.
 *
 * 1. Resolve the search root directory
 * 2. Create a Bun.Glob instance and scan the directory
 * 3. Filter with .gitignore matcher
 * 4. Stat each file for mtime, sort by newest first
 * 5. Apply the result limit
 */
export async function executeGlob(args: {
  pattern: string
  cwd?: string
  limit?: number
}): Promise<GlobResult> {
  const { pattern, cwd: cwdArg, limit } = args

  // --- Resolve search root ---
  const resolvedCwd = cwdArg ? resolveToolPath(cwdArg) : getWorkspaceRoot()
  const workspaceRoot = getWorkspaceRoot()
  const isIgnored = await getGitignoreFilter(workspaceRoot)

  // Validate the directory exists
  let cwdStat
  try {
    cwdStat = await stat(resolvedCwd)
  }
  catch {
    throw new Error(`Directory not found: ${cwdArg ?? resolvedCwd}`)
  }
  if (!cwdStat.isDirectory()) {
    throw new Error(`Not a directory: ${cwdArg ?? resolvedCwd}`)
  }

  // --- Scan with Bun.Glob ---
  const glob = new Glob(pattern)
  const allMatches: string[] = []

  for await (const filePath of glob.scan({
    cwd: resolvedCwd,
    dot: false,
    onlyFiles: true,
    followSymlinks: false,
  })) {
    const absPath = resolve(resolvedCwd, filePath)
    if (!isIgnored(absPath, false)) {
      allMatches.push(filePath)
    }
  }

  const totalMatches = allMatches.length

  // --- Apply limit ---
  const effectiveLimit = limit !== undefined
    ? Math.min(limit, HARD_MAX_LIMIT)
    : DEFAULT_LIMIT

  // --- Sort by modification time (newest first) ---
  // Optimization: when there are many matches, only stat a capped subset
  // to avoid thousands of stat syscalls. If total <= limit * 2, stat all;
  // otherwise stat a random sample + return alphabetically for the rest.
  const STAT_CAP = effectiveLimit * 2
  const filesToStat = totalMatches <= STAT_CAP
    ? allMatches
    : allMatches.slice(0, STAT_CAP)

  // Batch stat with concurrency limit to prevent fd exhaustion
  const CONCURRENCY = 64
  const withMtime: Array<{ file: string, mtime: number }> = []
  for (let i = 0; i < filesToStat.length; i += CONCURRENCY) {
    const batch = filesToStat.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const fileStat = await stat(resolve(resolvedCwd, file))
          return { file, mtime: fileStat.mtimeMs }
        }
        catch {
          return { file, mtime: 0 }
        }
      }),
    )
    withMtime.push(...results)
  }

  withMtime.sort((a, b) => b.mtime - a.mtime)

  const truncated = totalMatches > effectiveLimit
  const files = withMtime.slice(0, effectiveLimit).map(item => item.file)

  return {
    cwd: resolvedCwd,
    pattern,
    files,
    totalMatches,
    truncated,
  }
}

/**
 * Format a GlobResult into a human/LLM-friendly string.
 *
 * Example output:
 *   Found 42 files matching "**\/*.ts" in /project/src
 *
 *   src/index.ts
 *   src/utils/helpers.ts
 *   src/types.ts
 *   ...
 *
 *   [Truncated] Showing 200 of 342 matches. Use limit=500 to see more.
 */
export function formatGlobResult(result: GlobResult): string {
  const parts: string[] = []

  if (result.totalMatches === 0) {
    parts.push(`No files found matching "${result.pattern}" in ${result.cwd}`)
    return parts.join('\n')
  }

  // Header
  parts.push(
    `Found ${result.totalMatches} file${result.totalMatches === 1 ? '' : 's'} `
    + `matching "${result.pattern}" in ${result.cwd}`,
  )
  parts.push('') // blank separator

  // File list
  parts.push(result.files.join('\n'))

  // Truncation notice
  if (result.truncated) {
    parts.push('')
    parts.push(
      `[Truncated] Showing ${result.files.length} of ${result.totalMatches} matches. `
      + `Use limit=${Math.min(result.totalMatches, HARD_MAX_LIMIT)} to see more.`,
    )
  }

  return parts.join('\n')
}
