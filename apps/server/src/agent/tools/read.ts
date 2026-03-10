import { tool } from 'ai'
import { z } from 'zod'
import { readValidatedTextFile } from './file-utils.js'

/**
 * Configuration constants for the read tool.
 *
 * - AUTO_TRUNCATE_LINES: default max lines when `limit` is not specified,
 *   prevents token explosion from accidentally reading huge files.
 * - HARD_MAX_LINES: absolute upper bound even when `limit` is explicitly set,
 *   guards against unreasonable requests.
 */
const AUTO_TRUNCATE_LINES = 2000
const HARD_MAX_LINES = 10000

/**
 * Read file tool definition (Vercel AI SDK format).
 *
 * Design notes:
 * - Supports two modes:
 *   1. `offset` + `limit` — "start from line X, read N lines" (default)
 *   2. `offset` + `end_line` — "read lines X through Y" (range mode)
 * - When `end_line` is set, `limit` is ignored.
 * - `offset` is 1-based to match the line numbers shown in the output.
 */
export const readFileTool = tool({
  description:
    'Read the contents of a file with line numbers. '
    + 'Returns up to 2000 lines by default. '
    + 'Use `offset` and `limit` to paginate, or `offset` and `end_line` to read a specific range.',
  inputSchema: z.object({
    file_path: z
      .string()
      .describe('Path to the file (absolute or relative to the working directory)'),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based line number to start reading from (default: 1)'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of lines to return (default: 2000). Ignored when end_line is set.'),
    end_line: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('1-based inclusive end line number. When set, reads from offset (default 1) to end_line.'),
  }),
})

/**
 * Structured result returned by executeReadFile.
 */
export interface ReadFileResult {
  /** Resolved absolute path of the file */
  filePath: string
  /** Formatted content with line numbers */
  content: string
  /** First line number included in the output */
  startLine: number
  /** Last line number included in the output */
  endLine: number
  /** Total number of lines in the file */
  totalLines: number
  /** Whether the output was auto-truncated (only true when `limit` was NOT explicitly set) */
  truncated: boolean
}

/**
 * Split file text into lines, handling the common trailing-newline case.
 *
 * Most well-formed text files end with a newline, which produces an
 * empty string as the last element after split.  We trim that to avoid
 * inflating the reported line count by one.
 */
function splitLines(text: string): string[] {
  const lines = text.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

/**
 * Execute the read file tool.
 *
 * 1. Resolve and validate the file path
 * 2. Guard against directories, oversized files, and binary content
 * 3. Read the file, split into lines, apply offset/limit
 * 4. Return structured result with numbered content
 */
export async function executeReadFile(args: {
  file_path: string
  offset?: number
  limit?: number
  end_line?: number
}): Promise<ReadFileResult> {
  const { file_path, offset, limit, end_line } = args

  const { resolvedPath, fileStat, text } = await readValidatedTextFile({
    inputPath: file_path,
    fileNotFoundMessage: `File not found: ${file_path}`,
    binaryErrorMessage: `Binary file detected: ${file_path}. The read tool only supports text files.`,
  })

  // --- Empty file ---
  if (fileStat.size === 0) {
    return {
      filePath: resolvedPath,
      content: '',
      startLine: 0,
      endLine: 0,
      totalLines: 0,
      truncated: false,
    }
  }

  const lines = splitLines(text)
  const totalLines = lines.length

  // --- Compute effective range ---
  const startLine = Math.max(1, offset ?? 1)

  let endLine: number
  let truncated: boolean

  if (end_line !== undefined) {
    // Range mode: read from startLine to end_line (inclusive).
    // Cap at totalLines and HARD_MAX_LINES span, never auto-truncate.
    const cappedEnd = Math.min(end_line, totalLines)
    const maxSpanEnd = startLine + HARD_MAX_LINES - 1
    endLine = Math.min(cappedEnd, maxSpanEnd)
    truncated = false
  }
  else {
    // Original offset+limit mode
    const userSpecifiedLimit = limit !== undefined
    const effectiveLimit = userSpecifiedLimit
      ? Math.min(limit, HARD_MAX_LINES)
      : AUTO_TRUNCATE_LINES

    endLine = Math.min(totalLines, startLine + effectiveLimit - 1)
    truncated = !userSpecifiedLimit && endLine < totalLines
  }

  // --- Format output with line numbers ---
  const selectedLines = lines.slice(startLine - 1, endLine)

  // Right-align line numbers for visual alignment
  const numWidth = String(endLine).length
  const numberedContent = selectedLines
    .map((line, i) => {
      const num = String(startLine + i).padStart(numWidth)
      return `${num}|${line}`
    })
    .join('\n')

  return {
    filePath: resolvedPath,
    content: numberedContent,
    startLine,
    endLine,
    totalLines,
    truncated,
  }
}

/**
 * Format a ReadFileResult into a human/LLM-friendly string.
 *
 * The output includes:
 *  - A header with file path, total lines, and displayed range
 *  - The numbered content
 *  - A truncation notice with actionable next-step hint (if applicable)
 *
 * Example output:
 *   File: src/index.ts (95 lines total)
 *   Lines: 1-50
 *
 *     1|import { Hono } from 'hono'
 *     2|...
 *    50|export default app
 *
 *   [Truncated] 45 more lines remaining. Use offset=51 to continue reading.
 */
export function formatReadResult(result: ReadFileResult): string {
  const parts: string[] = []

  if (result.totalLines === 0) {
    parts.push(`File: ${result.filePath}`)
    parts.push('[Empty file]')
    return parts.join('\n')
  }

  // Header
  parts.push(`File: ${result.filePath} (${result.totalLines} lines total)`)
  parts.push(`Lines: ${result.startLine}-${result.endLine}`)
  parts.push('') // blank separator

  // Content
  parts.push(result.content)

  // Truncation notice — only when auto-truncated, not when the caller
  // explicitly chose a range. This tells the LLM exactly what to do next.
  if (result.truncated) {
    const remaining = result.totalLines - result.endLine
    parts.push('')
    parts.push(
      `[Truncated] ${remaining} more lines remaining. `
      + `Use offset=${result.endLine + 1} to continue reading.`,
    )
  }

  return parts.join('\n')
}
