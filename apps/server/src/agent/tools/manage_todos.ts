import { tool } from 'ai'
import { z } from 'zod'

type TodoStatus = 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
  createdAt: string
  updatedAt: string
}

interface TodoStore {
  items: TodoItem[]
}

const todoStoreByConversation = new Map<string, TodoStore>()
const draftTodoStore: TodoStore = { items: [] }

function getTodoStore(conversationId?: string): TodoStore {
  if (!conversationId)
    return draftTodoStore
  const existing = todoStoreByConversation.get(conversationId)
  if (existing)
    return existing
  const created: TodoStore = { items: [] }
  todoStoreByConversation.set(conversationId, created)
  return created
}

export const manageTodosTool = tool({
  description: 'Manage the session todo list (CRUD). Use this to add tasks, update status/content, delete tasks, or list current tasks. Keep items short and action-oriented.',
  inputSchema: z.object({
    action: z.enum(['add', 'update', 'delete', 'list', 'clear']).describe('Operation to perform on todo list'),
    taskId: z.string().optional().describe('Task ID, required for update/delete'),
    content: z.string().optional().describe('Task content, required for add; optional for update'),
    status: z.enum(['in_progress', 'completed']).optional().describe('Task status for add/update'),
    clearTarget: z.enum(['all', 'completed']).optional().describe('For clear action: clear all tasks or only completed tasks (default: completed)'),
  }),
})

export interface ManageTodosResult {
  action: 'add' | 'update' | 'delete' | 'list' | 'clear'
  changed: boolean
  todos: TodoItem[]
  message: string
}

export async function executeManageTodos(
  args: {
    action: 'add' | 'update' | 'delete' | 'list' | 'clear'
    taskId?: string
    content?: string
    status?: TodoStatus
    clearTarget?: 'all' | 'completed'
  },
  conversationId?: string,
): Promise<ManageTodosResult> {
  const store = getTodoStore(conversationId)
  const now = new Date().toISOString()

  if (args.action === 'list') {
    return {
      action: 'list',
      changed: false,
      todos: [...store.items],
      message: `Listed ${store.items.length} todo item(s).`,
    }
  }

  if (args.action === 'add') {
    const content = args.content?.trim() || ''
    if (!content) {
      return {
        action: 'add',
        changed: false,
        todos: [...store.items],
        message: 'Add skipped: content is required.',
      }
    }

    const item: TodoItem = {
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      content,
      status: args.status ?? 'in_progress',
      createdAt: now,
      updatedAt: now,
    }
    store.items.unshift(item)
    return {
      action: 'add',
      changed: true,
      todos: [...store.items],
      message: 'Added 1 todo item.',
    }
  }

  if (args.action === 'update') {
    const taskId = args.taskId?.trim()
    if (!taskId) {
      return {
        action: 'update',
        changed: false,
        todos: [...store.items],
        message: 'Update skipped: taskId is required.',
      }
    }

    const index = store.items.findIndex(t => t.id === taskId)
    if (index === -1) {
      return {
        action: 'update',
        changed: false,
        todos: [...store.items],
        message: `Update skipped: task ${taskId} not found.`,
      }
    }

    const target = store.items[index]!
    const nextContent = args.content?.trim()
    const hasContentUpdate = typeof nextContent === 'string' && nextContent.length > 0
    const hasStatusUpdate = !!args.status

    if (!hasContentUpdate && !hasStatusUpdate) {
      return {
        action: 'update',
        changed: false,
        todos: [...store.items],
        message: 'Update skipped: no fields to update.',
      }
    }

    store.items[index] = {
      ...target,
      content: hasContentUpdate ? nextContent! : target.content,
      status: hasStatusUpdate ? args.status! : target.status,
      updatedAt: now,
    }
    return {
      action: 'update',
      changed: true,
      todos: [...store.items],
      message: `Updated task ${taskId}.`,
    }
  }

  if (args.action === 'delete') {
    const taskId = args.taskId?.trim()
    if (!taskId) {
      return {
        action: 'delete',
        changed: false,
        todos: [...store.items],
        message: 'Delete skipped: taskId is required.',
      }
    }

    const before = store.items.length
    store.items = store.items.filter(t => t.id !== taskId)
    const changed = store.items.length !== before
    return {
      action: 'delete',
      changed,
      todos: [...store.items],
      message: changed ? `Deleted task ${taskId}.` : `Delete skipped: task ${taskId} not found.`,
    }
  }

  const clearTarget = args.clearTarget ?? 'completed'
  if (clearTarget === 'all') {
    const changed = store.items.length > 0
    store.items = []
    return {
      action: 'clear',
      changed,
      todos: [],
      message: changed ? 'Cleared all todo items.' : 'Todo list is already empty.',
    }
  }

  const before = store.items.length
  store.items = store.items.filter(t => t.status !== 'completed')
  const removed = before - store.items.length
  return {
    action: 'clear',
    changed: removed > 0,
    todos: [...store.items],
    message: removed > 0 ? `Cleared ${removed} completed todo item(s).` : 'No completed todo items to clear.',
  }
}

export function formatManageTodosResult(result: ManageTodosResult): string {
  const header = `${result.message}`
  if (result.todos.length === 0) {
    return `${header}\n\nCurrent todos: (empty)`
  }
  const lines = result.todos.map((todo, idx) => {
    const status = todo.status === 'completed' ? '[completed]' : '[in_progress]'
    return `${idx + 1}. ${status} (${todo.id}) ${todo.content}`
  })
  return `${header}\n\nCurrent todos:\n${lines.join('\n')}`
}
