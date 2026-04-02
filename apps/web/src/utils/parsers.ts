/**
 * Centralized parsing utilities for web UI.
 * Consolidates regex patterns and parsing logic from:
 * - delegateParsing.ts (delegate metadata)
 * - ToolCallItem.vue (question/answer blocks)
 * - useAssistantRuntime.ts (TODO tasks)
 */

// ===== Regex Patterns =====

const RE_ITERATIONS = /Iterations:\s*(\d+)/
const RE_TOKENS = /Tokens:\s*(\d+)\D*in:\s*(\d+)\D*out:\s*(\d+)/
const RE_DOUBLE_NEWLINE = /\n\n/
const RE_QUESTION_ANSWER_BLOCK = /^- ([^\n：]+)：\n([\s\S]*)$/
const RE_TODO_LINE = /^\d+\.\s+\[(?:completed|in_progress)\]/

// ===== Types =====

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

export interface TodoTask {
  id: string
  content: string
  status: 'in_progress' | 'completed'
}

export interface QuestionAnswerPair {
  question: string
  answer: string
}

// ===== Delegate Parsing =====

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

// ===== Question/Answer Parsing =====

/**
 * Parse question-answer block pairs from tool result string.
 * Expected format: "- Question text：\nAnswer text\n\n- Next question：\nNext answer"
 *
 * Returns `null` if the result is not a string or contains no valid blocks.
 */
export function parseQuestionAnswerBlocks(raw: unknown): QuestionAnswerPair[] | null {
  if (!raw || typeof raw !== 'string')
    return null

  const pairs: QuestionAnswerPair[] = []
  const blocks = raw.split(RE_DOUBLE_NEWLINE).filter(Boolean)

  for (const block of blocks) {
    const match = block.match(RE_QUESTION_ANSWER_BLOCK)
    if (match) {
      pairs.push({
        question: match[1]!,
        answer: match[2]!.trim(),
      })
    }
  }

  return pairs.length > 0 ? pairs : null
}

// ===== TODO Task Parsing =====

/**
 * Parse manage_todos tool results (object or legacy string format).
 * Handles both structured object format and legacy text format.
 * Returns `null` if parsing fails.
 */
export function parseManageTodosResult(result: unknown): TodoTask[] | null {
  if (typeof result === 'object' && result !== null) {
    const todos = (result as { todos?: unknown }).todos
    if (!Array.isArray(todos))
      return null

    const parsed = todos
      .map((item) => {
        if (typeof item !== 'object' || item === null)
          return null
        const maybe = item as { id?: unknown, content?: unknown, status?: unknown }
        if (typeof maybe.id !== 'string' || typeof maybe.content !== 'string')
          return null
        if (maybe.status !== 'in_progress' && maybe.status !== 'completed')
          return null
        return {
          id: maybe.id,
          content: maybe.content,
          status: maybe.status,
        } as TodoTask
      })
      .filter((item): item is TodoTask => !!item)

    return parsed
  }

  if (typeof result !== 'string')
    return null

  const lines = result.split('\n')
  const todoLines = lines.filter((line) => {
    const normalized = line.trim()
    return RE_TODO_LINE.test(normalized) && normalized.includes(') ')
  })

  if (todoLines.length === 0) {
    if (result.includes('Current todos: (empty)'))
      return []
    return null
  }

  const parsed: TodoTask[] = []
  for (const line of todoLines) {
    const normalized = line.trim()
    const status = normalized.includes('[completed]')
      ? 'completed'
      : normalized.includes('[in_progress]')
        ? 'in_progress'
        : null

    if (!status)
      continue

    const idStart = normalized.indexOf('(')
    const idEnd = normalized.indexOf(')', idStart + 1)
    if (idStart === -1 || idEnd === -1 || idEnd <= idStart + 1)
      continue

    const id = normalized.slice(idStart + 1, idEnd).trim()
    const content = normalized.slice(idEnd + 1).trim()
    if (!id || !content)
      continue

    parsed.push({
      id,
      status,
      content,
    })
  }

  return parsed
}
