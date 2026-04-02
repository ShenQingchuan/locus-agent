/**
 * Type definitions and type guards for delegate tool result parsing.
 */

export interface DelegateResultObject {
  success?: boolean
  taskId?: string
  agentName?: string
  agentType?: string
  iterations?: number
  usage?: { inputTokens: number, outputTokens: number, totalTokens: number }
}

export function isDelegateResultObject(raw: unknown): raw is DelegateResultObject {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

export interface TodoResultObject {
  todos?: unknown
}

export function isTodoResultObject(raw: unknown): raw is TodoResultObject {
  return typeof raw === 'object' && raw !== null && 'todos' in raw
}

export interface TodoItemObject {
  id: string
  content: string
  status: 'in_progress' | 'completed'
}

export function isTodoItemObject(item: unknown): item is TodoItemObject {
  if (typeof item !== 'object' || item === null)
    return false
  const obj = item as Record<string, unknown>
  return (
    typeof obj.id === 'string'
    && typeof obj.content === 'string'
    && (obj.status === 'in_progress' || obj.status === 'completed')
  )
}

export interface ToolCallResultObject {
  result?: string
}

export function isToolCallResultObject(raw: unknown): raw is ToolCallResultObject {
  if (typeof raw !== 'object' || raw === null)
    return false
  const obj = raw as Record<string, unknown>
  return !('result' in obj) || typeof obj.result === 'string'
}
