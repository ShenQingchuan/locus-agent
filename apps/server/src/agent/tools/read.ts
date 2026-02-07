import type { Buffer } from 'node:buffer'
import { readFile, stat } from 'node:fs/promises'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'

/**
 * Configuration constants for the read tool.
 *
 * - AUTO_TRUNCATE_LINES: default max lines when `limit` is not specified,
 *   prevents token explosion from accidentally reading huge files.
 * - HARD_MAX_LINES: absolute upper bound even when `limit` is explicitly set,
 *   guards against unreasonable requests.
 * - MAX_FILE_SIZE_BYTES: skip files larger than 10MB entirely (likely not text).
 * - BINARY_CHECK_SIZE: how many leading bytes to scan for null byte detection.
 */
const AUTO_TRUNCATE_LINES = 2000
const HARD_MAX_LINES = 10000
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const BINARY_CHECK_SIZE = 8192

/**
 * Read file tool definition (Vercel AI SDK format).
 *
 * Design notes:
 * - Uses `offset` + `limit` rather than `start_line` + `end_line`.
 *   LLMs reason better about "start from line X, read N lines" than
 *   computing an exact end line, and this avoids off-by-one confusion
 *   around inclusive vs exclusive bounds.
 * - `offset` is 1-based to match the line numbers shown in the output.
 */
export const readFileTool = tool({
  description:
    'Read the contents of a file with line numbers. '
    + 'Returns up to 2000 lines by default. '
    + 'Use `offset` and `limit` to paginate through large files.',
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
      .describe('Maximum number of lines to return (default: 2000)'),
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
 * Detect binary content by scanning for null bytes.
 *
 * Heuristic: any null byte within the first BINARY_CHECK_SIZE bytes
 * strongly suggests this is not a text file.  This catches most common
 * binary formats (images, compiled binaries, archives, etc.) while
 * being cheap to compute.
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, BINARY_CHECK_SIZE)
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
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
  if (lines.length > 1 && lines[lines.length - 1] === '') {
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
}): Promise<ReadFileResult> {
  const { file_path, offset, limit } = args

  // --- Path resolution ---
  const resolvedPath = resolveToolPath(file_path)

  // --- Existence & type check ---
  let fileStat
  try {
    fileStat = await stat(resolvedPath)
  }
  catch {
    throw new Error(`File not found: ${file_path}`)
  }

  if (fileStat.isDirectory()) {
    throw new Error(
      `Path is a directory, not a file: ${file_path}. `
      + 'Use the bash tool with `ls` to list directory contents.',
    )
  }
  if (!fileStat.isFile()) {
    throw new Error(`Not a regular file: ${file_path}`)
  }

  // --- Size guard ---
  if (fileStat.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1)
    throw new Error(
      `File is too large (${sizeMB} MB). `
      + `Maximum supported size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    )
  }

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

  // --- Read raw bytes for binary detection, then decode ---
  const buffer = await readFile(resolvedPath)

  if (isBinaryBuffer(buffer)) {
    throw new Error(
      `Binary file detected: ${file_path}. `
      + 'The read tool only supports text files.',
    )
  }

  const text = buffer.toString('utf-8')
  const lines = splitLines(text)
  const totalLines = lines.length

  // --- Compute effective range ---
  const startLine = Math.max(1, offset ?? 1)

  // When the caller does not supply `limit`, we auto-truncate at
  // AUTO_TRUNCATE_LINES so the LLM context window stays manageable.
  // When `limit` IS provided, we still cap at HARD_MAX_LINES as a
  // safety net, but this is not considered "truncation" (the caller
  // explicitly asked for a range).
  const userSpecifiedLimit = limit !== undefined
  const effectiveLimit = userSpecifiedLimit
    ? Math.min(limit, HARD_MAX_LINES)
    : AUTO_TRUNCATE_LINES

  const endLine = Math.min(totalLines, startLine + effectiveLimit - 1)

  // Truncation means we auto-limited the output without the caller
  // explicitly asking for it.
  const truncated = !userSpecifiedLimit && endLine < totalLines

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
