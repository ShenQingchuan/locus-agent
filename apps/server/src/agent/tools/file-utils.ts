import type { Buffer } from 'node:buffer'
import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { resolveToolPath } from './resolve-path.js'

export const DEFAULT_TEXT_FILE_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const DEFAULT_BINARY_CHECK_SIZE = 8192

export function isBinaryBuffer(buffer: Buffer, checkSize = DEFAULT_BINARY_CHECK_SIZE): boolean {
  const limit = Math.min(buffer.length, checkSize)
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}

export async function validateRegularFile(
  inputPath: string,
  fileNotFoundMessage: string,
): Promise<{ resolvedPath: string, fileStat: Stats }> {
  const resolvedPath = resolveToolPath(inputPath)

  let fileStat: Stats
  try {
    fileStat = await stat(resolvedPath)
  }
  catch {
    throw new Error(fileNotFoundMessage)
  }

  if (fileStat.isDirectory()) {
    throw new Error(
      `Path is a directory, not a file: ${inputPath}. `
      + 'Use the bash tool with `ls` to list directory contents.',
    )
  }
  if (!fileStat.isFile()) {
    throw new Error(`Not a regular file: ${inputPath}`)
  }

  return { resolvedPath, fileStat }
}

export async function readValidatedTextFile(options: {
  inputPath: string
  fileNotFoundMessage: string
  binaryErrorMessage: string
  maxFileSizeBytes?: number
}): Promise<{ resolvedPath: string, fileStat: Stats, buffer: Buffer, text: string }> {
  const {
    inputPath,
    fileNotFoundMessage,
    binaryErrorMessage,
    maxFileSizeBytes = DEFAULT_TEXT_FILE_MAX_SIZE_BYTES,
  } = options

  const { resolvedPath, fileStat } = await validateRegularFile(inputPath, fileNotFoundMessage)

  if (fileStat.size > maxFileSizeBytes) {
    const sizeMB = (fileStat.size / (1024 * 1024)).toFixed(1)
    throw new Error(
      `File is too large (${sizeMB} MB). `
      + `Maximum supported size is ${maxFileSizeBytes / (1024 * 1024)} MB.`,
    )
  }

  const buffer = await readFile(resolvedPath)
  if (isBinaryBuffer(buffer)) {
    throw new Error(binaryErrorMessage)
  }

  return {
    resolvedPath,
    fileStat,
    buffer,
    text: buffer.toString('utf-8'),
  }
}

export async function resolveWriteTarget(inputPath: string): Promise<{ resolvedPath: string, existed: boolean }> {
  const resolvedPath = resolveToolPath(inputPath)

  try {
    const fileStat = await stat(resolvedPath)
    if (fileStat.isDirectory()) {
      throw new Error(
        `Path is a directory, not a file: ${inputPath}. Cannot overwrite a directory.`,
      )
    }
    return { resolvedPath, existed: true }
  }
  catch (error) {
    if (error instanceof Error && error.message.includes('directory')) {
      throw error
    }

    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { resolvedPath, existed: false }
    }

    return { resolvedPath, existed: false }
  }
}
