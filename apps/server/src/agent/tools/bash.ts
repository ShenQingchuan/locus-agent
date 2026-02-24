import { tool } from 'ai'
import { z } from 'zod'

/**
 * Bash 工具定义
 */
export const bashTool = tool({
  description: 'Execute a bash command and return the output. Use this to run shell commands, scripts, or system operations.',
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 30000)'),
  }),
})

/**
 * Bash 工具执行结果
 */
export interface BashResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

/**
 * 流式输出回调选项
 */
export interface BashStreamCallbacks {
  onStdout?: (chunk: string) => void | Promise<void>
  onStderr?: (chunk: string) => void | Promise<void>
}

/**
 * 从 ReadableStream 逐块读取并回调，同时收集完整内容
 */
async function consumeStream(
  stream: ReadableStream<Uint8Array> | null,
  onChunk?: (chunk: string) => void | Promise<void>,
): Promise<string> {
  if (!stream)
    return ''

  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let collected = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      const text = decoder.decode(value, { stream: true })
      collected += text
      if (onChunk) {
        await onChunk(text)
      }
    }
    // Flush remaining bytes
    const remaining = decoder.decode()
    if (remaining) {
      collected += remaining
      if (onChunk) {
        await onChunk(remaining)
      }
    }
  }
  finally {
    reader.releaseLock()
  }

  return collected
}

/**
 * Bash 工具执行函数
 */
export async function executeBash(
  args: { command: string, timeout?: number },
  streamCallbacks?: BashStreamCallbacks,
): Promise<BashResult> {
  const { command, timeout = 30000 } = args

  try {
    const proc = Bun.spawn(['bash', '-c', command], {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...Bun.env },
    })

    // 设置超时
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, timeout)

    // 并发流式读取 stdout 和 stderr，同时等待进程退出
    const [stdout, stderr, exitCode] = await Promise.all([
      consumeStream(proc.stdout as ReadableStream<Uint8Array>, streamCallbacks?.onStdout),
      consumeStream(proc.stderr as ReadableStream<Uint8Array>, streamCallbacks?.onStderr),
      proc.exited,
    ])

    // 清除超时
    clearTimeout(timeoutId)

    return {
      stdout,
      stderr,
      exitCode,
      timedOut,
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      stdout: '',
      stderr: `Error executing command: ${errorMessage}`,
      exitCode: 1,
      timedOut: false,
    }
  }
}

/**
 * 格式化 Bash 执行结果为字符串
 */
export function formatBashResult(result: BashResult): string {
  const parts: string[] = []

  if (result.timedOut) {
    parts.push('[Command timed out]')
  }

  if (result.stdout) {
    parts.push(result.stdout)
  }

  if (result.stderr) {
    parts.push(`[stderr]\n${result.stderr}`)
  }

  if (!result.stdout && !result.stderr && !result.timedOut) {
    parts.push(`[exit code: ${result.exitCode}]`)
  }
  else if (result.exitCode !== 0) {
    parts.push(`[exit code: ${result.exitCode}]`)
  }

  return parts.join('\n')
}
