import type { Buffer } from 'node:buffer'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { tool } from 'ai'
import { applyPatch } from 'diff'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'

/** Max file size for edit (same as read tool). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const BINARY_CHECK_SIZE = 8192

/**
 * Edit file tool: apply a unified diff (patch) to a file.
 * On-demand: LLM outputs a small diff; we apply it directly. No whole-file replace or heavy search.
 */
export const editFileTool = tool({
  description:
    'Edit a text file by applying a unified diff (patch). '
    + 'Use read_file first to get current content and line numbers. '
    + 'Then output a patch in unified diff format (e.g. ---/+++ header, @@ hunk, -removed, +added lines). '
    + 'Prefer small, targeted patches. One edit_file call = one patch applied to one file.',
  inputSchema: z.object({
    file_path: z
      .string()
      .describe('Path to the file (absolute or relative to the working directory)'),
    patch: z
      .string()
      .describe(
        'Unified diff to apply (e.g. like `diff -u` or git diff). '
        + 'Must match the current file content at the given line ranges.',
      ),
  }),
})

export interface EditFileResult {
  /** Resolved absolute path of the file */
  filePath: string
  /** Whether the patch was applied */
  success: boolean
  /** Human-readable message (error reason or success summary) */
  message: string
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, BINARY_CHECK_SIZE)
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0)
      return true
  }
  return false
}

export async function executeEditFile(args: {
  file_path: string
  patch: string
}): Promise<EditFileResult> {
  const { file_path, patch } = args

  const resolvedPath = resolveToolPath(file_path)

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

  if (fileStat.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1)
    throw new Error(
      `File is too large (${sizeMB} MB). `
      + `Maximum supported size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    )
  }

  const buffer = await readFile(resolvedPath)
  if (isBinaryBuffer(buffer)) {
    throw new Error(
      `Binary file detected: ${file_path}. The edit tool only supports text files.`,
    )
  }

  const content = buffer.toString('utf-8')

  // Apply unified diff (with fuzz so minor context drift can still apply)
  const patched = applyPatch(content, patch, { fuzzFactor: 2 })
  if (patched === false) {
    return {
      filePath: resolvedPath,
      success: false,
      message:
        'Patch could not be applied: context did not match. '
        + 'Use read_file to get the exact current content and line numbers, then output a patch that matches those lines.',
    }
  }

  await writeFile(resolvedPath, patched, 'utf-8')
  return {
    filePath: resolvedPath,
    success: true,
    message: `File: ${resolvedPath} updated. Patch applied.`,
  }
}

/**
 * Format EditFileResult into a string for the LLM.
 */
export function formatEditResult(result: EditFileResult): string {
  return result.message
}
