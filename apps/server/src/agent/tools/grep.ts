import { tool } from 'ai'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'
import { getWorkspaceRoot } from './workspace-root.js'

const RE_RG_MATCH_LINE = /^(.+?):(\d+):(.*)$/
const RE_RG_CONTEXT_LINE = /^(.+?)-(\d+)-(.*)$/
const RE_GLOB_BRACES = /\{([^}]+)\}/g

/**
 * Maximum number of matching lines returned by default.
 * Prevents token explosion when the pattern matches thousands of lines.
 */
const DEFAULT_LIMIT = 100

/**
 * Absolute upper bound even when the caller explicitly sets `limit`.
 */
const HARD_MAX_LIMIT = 500

/**
 * Maximum context lines to show around matches.
 */
const MAX_CONTEXT_LINES = 5

/**
 * Grep tool definition (Vercel AI SDK format).
 *
 * Design notes:
 * - This is a **read-only** content search tool with risk level `safe`.
 * - Uses ripgrep (rg) for fast regex searching when available, falls back to Bun grep.
 * - Returns matching file paths and line numbers with context.
 */
export const grepTool = tool({
  description:
    'Search file contents using a regex pattern. '
    + 'Returns matching lines with file paths and line numbers. '
    + 'Use `include` to filter by file type (e.g. "*.ts", "*.{ts,vue}"). '
    + 'Respects .gitignore rules. Much faster than reading files one by one.',
  inputSchema: z.object({
    pattern: z
      .string()
      .describe('Regex pattern to search for in file contents (e.g. "function\\s+\\w+", "TODO", "import.*from")'),
    path: z
      .string()
      .optional()
      .describe('Directory to search in (default: workspace root). Absolute or relative path.'),
    include: z
      .string()
      .optional()
      .describe('File pattern to include (e.g. "*.ts", "*.{ts,tsx,vue}"). Only files matching this glob are searched.'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of matching lines to return (default: 100)'),
    context_lines: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Number of context lines to show around each match (default: 0, max: 5)'),
  }),
})

/**
 * Structured result returned by executeGrep.
 */
export interface GrepResult {
  /** The resolved root directory that was searched */
  cwd: string
  /** The regex pattern used */
  pattern: string
  /** Include filter used (if any) */
  include?: string
  /** Matching lines with file and line info */
  matches: GrepMatch[]
  /** Total number of matches found before applying limit */
  totalMatches: number
  /** Whether the results were truncated due to the limit */
  truncated: boolean
}

export interface GrepMatch {
  /** File path relative to cwd */
  file: string
  /** Line number (1-based) */
  line: number
  /** The matching line content */
  content: string
  /** Context lines before the match */
  beforeContext?: string[]
  /** Context lines after the match */
  afterContext?: string[]
}

/**
 * Execute the grep tool using ripgrep (rg) subprocess for speed.
 * Falls back to a simpler approach if rg is not available.
 */
export async function executeGrep(args: {
  pattern: string
  path?: string
  include?: string
  limit?: number
  context_lines?: number
}): Promise<GrepResult> {
  const { pattern, path: pathArg, include, limit, context_lines } = args

  const resolvedCwd = pathArg ? resolveToolPath(pathArg) : getWorkspaceRoot()
  const effectiveLimit = limit !== undefined
    ? Math.min(limit, HARD_MAX_LIMIT)
    : DEFAULT_LIMIT
  const contextLines = context_lines !== undefined
    ? Math.min(context_lines, MAX_CONTEXT_LINES)
    : 0

  // Build ripgrep command
  const rgArgs: string[] = [
    'rg',
    '--line-number',
    '--no-heading',
    '--color=never',
    '--max-count=500', // internal cap per file
  ]

  if (contextLines > 0) {
    rgArgs.push(`--context=${contextLines}`)
  }

  if (include) {
    // Support multiple patterns like "*.{ts,tsx}"
    rgArgs.push(`--glob=${include}`)
  }

  rgArgs.push('--', pattern, '.')

  try {
    const proc = Bun.spawn(rgArgs, {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: resolvedCwd,
    })

    const decoder = new TextDecoder()
    const stdout = decoder.decode(await new Response(proc.stdout as ReadableStream).arrayBuffer())
    await proc.exited

    // Parse ripgrep output
    const matches: GrepMatch[] = []
    const lines = stdout.split('\n')

    if (contextLines > 0) {
      // With context, rg uses '--' separators between groups
      let currentBeforeContext: string[] = []
      let currentMatch: GrepMatch | null = null
      let afterCount = 0

      for (const line of lines) {
        if (line === '--') {
          // Group separator: flush current match
          if (currentMatch) {
            matches.push(currentMatch)
            currentMatch = null
          }
          currentBeforeContext = []
          afterCount = 0
          continue
        }

        if (!line)
          continue

        // Context lines use '-' separator, match lines use ':'
        const matchResult = line.match(RE_RG_MATCH_LINE)
        const contextResult = line.match(RE_RG_CONTEXT_LINE)

        if (matchResult) {
          // This is a match line
          if (currentMatch) {
            matches.push(currentMatch)
          }
          currentMatch = {
            file: matchResult[1],
            line: Number.parseInt(matchResult[2], 10),
            content: matchResult[3],
            beforeContext: currentBeforeContext.length > 0 ? [...currentBeforeContext] : undefined,
          }
          currentBeforeContext = []
          afterCount = 0
        }
        else if (contextResult) {
          if (currentMatch && afterCount < contextLines) {
            // After context for current match
            if (!currentMatch.afterContext)
              currentMatch.afterContext = []
            currentMatch.afterContext.push(contextResult[3])
            afterCount++
          }
          else {
            // Before context for next match
            currentBeforeContext.push(contextResult[3])
            if (currentBeforeContext.length > contextLines) {
              currentBeforeContext.shift()
            }
          }
        }
      }

      // Flush last match
      if (currentMatch) {
        matches.push(currentMatch)
      }
    }
    else {
      // Simple mode: no context
      for (const line of lines) {
        if (!line)
          continue
        const match = line.match(RE_RG_MATCH_LINE)
        if (match) {
          matches.push({
            file: match[1],
            line: Number.parseInt(match[2], 10),
            content: match[3],
          })
        }
      }
    }

    const totalMatches = matches.length
    const truncated = totalMatches > effectiveLimit
    const limitedMatches = matches.slice(0, effectiveLimit)

    return {
      cwd: resolvedCwd,
      pattern,
      include,
      matches: limitedMatches,
      totalMatches,
      truncated,
    }
  }
  catch {
    // Fallback: rg not available, use basic Bun grep approach
    return executeGrepFallback(pattern, resolvedCwd, include, effectiveLimit)
  }
}

/**
 * Fallback grep using Bun.spawn with basic grep
 */
async function executeGrepFallback(
  pattern: string,
  cwd: string,
  include: string | undefined,
  limit: number,
): Promise<GrepResult> {
  const grepArgs: string[] = ['grep', '-rn', '--color=never']

  if (include) {
    // Convert glob to grep --include format
    const patterns = include.replace(RE_GLOB_BRACES, (_m, p1: string) => {
      return p1.split(',').join('|')
    })
    for (const p of patterns.split('|')) {
      grepArgs.push(`--include=${p.trim()}`)
    }
  }

  grepArgs.push('-E', pattern, '.')

  const proc = Bun.spawn(grepArgs, {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
  })

  const decoder = new TextDecoder()
  const stdout = decoder.decode(await new Response(proc.stdout as ReadableStream).arrayBuffer())
  await proc.exited

  const matches: GrepMatch[] = []
  for (const line of stdout.split('\n')) {
    if (!line)
      continue
    const match = line.match(RE_RG_MATCH_LINE)
    if (match) {
      matches.push({
        file: match[1],
        line: Number.parseInt(match[2], 10),
        content: match[3],
      })
    }
  }

  const totalMatches = matches.length
  const truncated = totalMatches > limit
  const limitedMatches = matches.slice(0, limit)

  return {
    cwd,
    pattern,
    include,
    matches: limitedMatches,
    totalMatches,
    truncated,
  }
}

/**
 * Format a GrepResult into a human/LLM-friendly string.
 */
export function formatGrepResult(result: GrepResult): string {
  const parts: string[] = []

  if (result.totalMatches === 0) {
    parts.push(`No matches found for pattern "${result.pattern}" in ${result.cwd}`)
    if (result.include) {
      parts.push(`(filtered by: ${result.include})`)
    }
    return parts.join('\n')
  }

  // Header
  parts.push(
    `Found ${result.totalMatches} match${result.totalMatches === 1 ? '' : 'es'} `
    + `for "${result.pattern}" in ${result.cwd}`,
  )
  if (result.include) {
    parts.push(`(filtered by: ${result.include})`)
  }
  parts.push('')

  // Group matches by file for readability
  const byFile = new Map<string, GrepMatch[]>()
  for (const m of result.matches) {
    const existing = byFile.get(m.file)
    if (existing) {
      existing.push(m)
    }
    else {
      byFile.set(m.file, [m])
    }
  }

  byFile.forEach((fileMatches, file) => {
    parts.push(`${file}:`)
    for (const m of fileMatches) {
      if (m.beforeContext) {
        for (const ctx of m.beforeContext) {
          parts.push(`  ${String(m.line - m.beforeContext.length + m.beforeContext.indexOf(ctx)).padStart(5)}-  ${ctx}`)
        }
      }
      parts.push(`  ${String(m.line).padStart(5)}:  ${m.content}`)
      if (m.afterContext) {
        for (let i = 0; i < m.afterContext.length; i++) {
          parts.push(`  ${String(m.line + i + 1).padStart(5)}-  ${m.afterContext[i]}`)
        }
      }
    }
    parts.push('')
  })

  // Truncation notice
  if (result.truncated) {
    parts.push(
      `[Truncated] Showing ${result.matches.length} of ${result.totalMatches} matches. `
      + `Use limit=${Math.min(result.totalMatches, HARD_MAX_LIMIT)} to see more.`,
    )
  }

  return parts.join('\n')
}
