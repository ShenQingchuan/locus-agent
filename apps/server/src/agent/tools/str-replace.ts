import type { Buffer } from 'node:buffer'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'

/** 文件大小上限（与 read 工具一致） */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const BINARY_CHECK_SIZE = 8192

/**
 * 字符串替换工具定义
 *
 * LLM 提供要查找的精确子串及其替换内容。
 * 子串在文件中必须恰好出现一次，避免歧义。
 */
export const strReplaceTool = tool({
  description:
    'Replace an exact string occurrence in a file. '
    + 'old_string must match exactly ONE location in the file (including whitespace and indentation). '
    + 'Include enough surrounding context lines to ensure uniqueness. '
    + 'For multiple changes to one file, make separate str_replace calls.',
  inputSchema: z.object({
    file_path: z
      .string()
      .describe('Path to the file (absolute or relative to the working directory)'),
    old_string: z
      .string()
      .min(1)
      .describe('The exact string to find in the file. Must be unique within the file.'),
    new_string: z
      .string()
      .describe('The replacement string. Use empty string to delete the matched text.'),
  }),
})

/**  success 时附带变更后的上下文行数 */
const SNIPPET_CONTEXT_LINES = 3

/**
 * 字符串替换工具执行结果
 */
export interface StrReplaceResult {
  /** 解析后的绝对路径 */
  filePath: string
  /** 替换是否成功 */
  success: boolean
  /** 结果消息 */
  message: string
  /** 成功时变更后的片段（含行号），便于确认，无需再读文件 */
  snippet?: string
}

/**
 * 检测 buffer 是否为二进制内容（扫描前 N 字节中的空字节）。
 */
function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, BINARY_CHECK_SIZE)
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0)
      return true
  }
  return false
}

/**
 * 统计 `needle` 在 `haystack` 中的非重叠出现次数。
 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while (true) {
    pos = haystack.indexOf(needle, pos)
    if (pos === -1)
      break
    count++
    pos += needle.length
  }
  return count
}

/**
 * 字符串替换工具执行函数
 */
export async function executeStrReplace(args: {
  file_path: string
  old_string: string
  new_string: string
}): Promise<StrReplaceResult> {
  const { file_path, old_string, new_string } = args

  const resolvedPath = resolveToolPath(file_path)

  // 文件存在性与类型检查
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
      `Binary file detected: ${file_path}. The str_replace tool only supports text files.`,
    )
  }

  const content = buffer.toString('utf-8')

  // 唯一性校验
  const occurrences = countOccurrences(content, old_string)

  if (occurrences === 0) {
    return {
      filePath: resolvedPath,
      success: false,
      message:
        'old_string not found in file. '
        + 'Use read_file to verify the exact current content, then provide the correct string to match.',
    }
  }

  if (occurrences > 1) {
    return {
      filePath: resolvedPath,
      success: false,
      message:
        `old_string matched ${occurrences} locations (must be unique). `
        + 'Include more surrounding context lines to narrow down to exactly one match.',
    }
  }

  // 执行替换
  const newContent = content.replace(old_string, new_string)
  await writeFile(resolvedPath, newContent, 'utf-8')

  // 提取变更处附近的片段，便于 LLM 确认而不必再读文件
  const lines = newContent.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '')
    lines.pop()
  const insertIdx = content.indexOf(old_string)
  const insertEnd = insertIdx + new_string.length
  const lineStarts: number[] = [0]
  for (let i = 0; i < newContent.length; i++) {
    if (newContent[i] === '\n')
      lineStarts.push(i + 1)
  }
  const findLine = (pos: number) => {
    const idx = lineStarts.findIndex(s => s > pos)
    return idx >= 0 ? idx - 1 : Math.max(0, lines.length - 1)
  }
  const startLine = findLine(insertIdx)
  const endLine = findLine(insertEnd)
  const centerLine = Math.floor((startLine + endLine) / 2)
  const from = Math.max(0, centerLine - SNIPPET_CONTEXT_LINES)
  const to = Math.min(lines.length, centerLine + SNIPPET_CONTEXT_LINES + 1)
  const snippetLines = lines.slice(from, to)
  const numWidth = String(to).length
  const snippet = snippetLines
    .map((line, i) => `${String(from + i + 1).padStart(numWidth)}|${line}`)
    .join('\n')

  return {
    filePath: resolvedPath,
    success: true,
    message: `File: ${resolvedPath} updated. Replaced 1 occurrence.`,
    snippet,
  }
}

/**
 * 格式化替换结果为字符串
 */
export function formatStrReplaceResult(result: StrReplaceResult): string {
  if (result.success && result.snippet) {
    return `${result.message}\n\nSnippet (no need to read_file):\n${result.snippet}`
  }
  return result.message
}
