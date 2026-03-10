const RE_ITERATIONS = /Iterations:\s*(\d+)/
const RE_TOKENS = /Tokens:\s*(\d+)\D*in:\s*(\d+)\D*out:\s*(\d+)/

export interface DelegateMeta {
  taskId: string
  iterations: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  success: boolean
  agentName: string
  agentType: string
}

/**
 * Parse delegate result metadata from either object or legacy string format.
 * Returns `null` when the result cannot be parsed.
 */
export function parseDelegateMeta(raw: unknown): DelegateMeta | null {
  // Object format (includes deltas)
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as {
      success?: boolean
      taskId?: string
      agentName?: string
      agentType?: string
      iterations?: number
      usage?: { inputTokens: number, outputTokens: number, totalTokens: number }
    }
    return {
      taskId: r.taskId ?? '',
      iterations: r.iterations ?? 0,
      inputTokens: r.usage?.inputTokens ?? 0,
      outputTokens: r.usage?.outputTokens ?? 0,
      totalTokens: r.usage?.totalTokens ?? 0,
      success: r.success ?? false,
      agentName: r.agentName ?? '',
      agentType: r.agentType ?? '',
    }
  }

  // Legacy string format
  if (typeof raw === 'string') {
    const lines = raw.split('\n')
    let iterations = 0
    let inputTokens = 0
    let outputTokens = 0
    let totalTokens = 0
    let success = false
    let taskId = ''
    let agentName = ''
    let agentType = ''

    for (const line of lines.slice(0, 10)) {
      if (line.startsWith('task_id:')) {
        taskId = line.replace('task_id:', '').split(' ')[0]!.trim()
      }
      if (line.startsWith('## Delegate Result:')) {
        agentName = line.replace('## Delegate Result:', '').trim()
      }
      if (line.startsWith('Type:')) {
        agentType = line.replace('Type:', '').trim()
      }
      if (line.startsWith('Success:')) {
        success = line.includes('true')
      }
      if (line.startsWith('Iterations:')) {
        const match = line.match(RE_ITERATIONS)
        if (match)
          iterations = Number.parseInt(match[1]!, 10)
      }
      if (line.startsWith('Tokens:')) {
        const match = line.match(RE_TOKENS)
        if (match) {
          totalTokens = Number.parseInt(match[1]!, 10)
          inputTokens = Number.parseInt(match[2]!, 10)
          outputTokens = Number.parseInt(match[3]!, 10)
        }
      }
    }

    return { taskId, iterations, inputTokens, outputTokens, totalTokens, success, agentName, agentType }
  }

  return null
}
