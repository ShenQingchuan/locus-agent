import { writeFile } from 'node:fs/promises'
import { tool } from 'ai'
import { z } from 'zod'
import { readValidatedTextFile } from './file-utils.js'
import { replaceUniqueString } from './string-replace.js'

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
 * 字符串替换工具执行函数
 */
export async function executeStrReplace(args: {
  file_path: string
  old_string: string
  new_string: string
}): Promise<StrReplaceResult> {
  const { file_path, old_string, new_string } = args

  const { resolvedPath, text: content } = await readValidatedTextFile({
    inputPath: file_path,
    fileNotFoundMessage: `File not found: ${file_path}`,
    binaryErrorMessage: `Binary file detected: ${file_path}. The str_replace tool only supports text files.`,
  })

  const replaced = replaceUniqueString(content, old_string, new_string)

  if (!replaced.ok) {
    if (replaced.reason === 'not_found') {
      return {
        filePath: resolvedPath,
        success: false,
        message:
          'old_string not found in file. '
          + 'Use read_file to verify the exact current content, then provide the correct string to match.',
      }
    }
    return {
      filePath: resolvedPath,
      success: false,
      message:
        `old_string matched ${replaced.occurrences} locations (must be unique). `
        + 'Include more surrounding context lines to narrow down to exactly one match.',
    }
  }

  const newContent: string = replaced.value
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
  const snippetLines: string[] = lines.slice(from, to)
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
