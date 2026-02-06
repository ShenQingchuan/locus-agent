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
 * Bash 工具执行函数
 */
export async function executeBash(args: { command: string, timeout?: number }): Promise<BashResult> {
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

    // 等待进程完成
    const exitCode = await proc.exited

    // 清除超时
    clearTimeout(timeoutId)

    // 读取输出
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()

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
