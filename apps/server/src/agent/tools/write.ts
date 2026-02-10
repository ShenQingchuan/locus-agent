import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveToolPath } from './resolve-path.js'

/**
 * 文件写入工具定义
 *
 * 创建新文件或覆写已有文件，自动创建中间目录。
 */
export const writeFileTool = tool({
  description:
    'Create a new file or overwrite an existing file with the given content. '
    + 'Intermediate directories are created automatically. '
    + 'Prefer str_replace for editing existing files; use write_file only for new files or full rewrites.',
  inputSchema: z.object({
    file_path: z
      .string()
      .describe('Path to the file (absolute or relative to the working directory)'),
    content: z
      .string()
      .describe('The full content to write to the file.'),
  }),
})

/**
 * 文件写入工具执行结果
 */
export interface WriteFileResult {
  /** 解析后的绝对路径 */
  filePath: string
  /** 是新建文件还是覆写 */
  created: boolean
  /** 结果消息 */
  message: string
}

/**
 * 文件写入工具执行函数
 */
export async function executeWriteFile(args: {
  file_path: string
  content: string
}): Promise<WriteFileResult> {
  const { file_path, content } = args

  const resolvedPath = resolveToolPath(file_path)

  // 检查文件是否已存在
  let existed = false
  try {
    const fileStat = await stat(resolvedPath)
    if (fileStat.isDirectory()) {
      throw new Error(
        `Path is a directory, not a file: ${file_path}. Cannot overwrite a directory.`,
      )
    }
    existed = true
  }
  catch (error) {
    // 文件不存在，将被创建
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      existed = false
    }
    else if (error instanceof Error && error.message.includes('directory')) {
      throw error
    }
    else {
      existed = false
    }
  }

  // 确保父目录存在
  await mkdir(dirname(resolvedPath), { recursive: true })

  await writeFile(resolvedPath, content, 'utf-8')

  return {
    filePath: resolvedPath,
    created: !existed,
    message: existed
      ? `File: ${resolvedPath} overwritten. Content is as provided; no need to read_file to confirm.`
      : `File: ${resolvedPath} created. Content is as provided; no need to read_file to confirm.`,
  }
}

/**
 * 格式化写入结果为字符串
 */
export function formatWriteResult(result: WriteFileResult): string {
  return result.message
}
