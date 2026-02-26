import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Glob } from 'bun'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'

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
 * Directories always excluded from scanning.
 * These are universally noisy and almost never what the user wants.
 */
const ALWAYS_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.output',
  '.nuxt',
  '.next',
  '.cache',
  '.turbo',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
])

/**
 * Glob tool definition (Vercel AI SDK format).
 *
 * Design notes:
 * - This is a **read-only** file discovery tool with risk level `safe`.
 *   It never modifies the filesystem.
 * - Returns matching file paths sorted by modification time (newest first),
 *   so the LLM can quickly focus on recently changed files.
 * - Common noise directories (node_modules, .git, dist, etc.) are
 *   automatically excluded to keep results relevant.
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
    + 'Common noise directories (node_modules, .git, dist, etc.) are excluded automatically. '
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
 * Check whether a relative path contains any segment that should be ignored.
 *
 * For a path like "node_modules/foo/bar.js", splitting on "/" yields
 * ["node_modules", "foo", "bar.js"] – we check each directory segment
 * against the ignore set.
 */
function shouldIgnore(relativePath: string): boolean {
  const segments = relativePath.split('/')
  // Check all segments except the last one (filename)
  // But also check the last in case it is a directory entry
  for (const segment of segments) {
    if (ALWAYS_IGNORE_DIRS.has(segment)) {
      return true
    }
  }
  return false
}

/**
 * Execute the glob tool.
 *
 * 1. Resolve the search root directory
 * 2. Create a Bun.Glob instance and scan the directory
 * 3. Filter out ignored directories
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
  const resolvedCwd = cwdArg ? resolveToolPath(cwdArg) : process.cwd()

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
    if (!shouldIgnore(filePath)) {
      allMatches.push(filePath)
    }
  }

  const totalMatches = allMatches.length

  // --- Sort by modification time (newest first) ---
  // Stat files in parallel for mtime, with graceful fallback
  const withMtime = await Promise.all(
    allMatches.map(async (file) => {
      try {
        const fileStat = await stat(resolve(resolvedCwd, file))
        return { file, mtime: fileStat.mtimeMs }
      }
      catch {
        // File might have been deleted between scan and stat
        return { file, mtime: 0 }
      }
    }),
  )

  withMtime.sort((a, b) => b.mtime - a.mtime)

  // --- Apply limit ---
  const effectiveLimit = limit !== undefined
    ? Math.min(limit, HARD_MAX_LIMIT)
    : DEFAULT_LIMIT

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
