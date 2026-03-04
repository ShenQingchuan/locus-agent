import { tool } from 'ai'
import { z } from 'zod'
import {
  addTodoItem,
  clearTodoItems,
  deleteTodoItem,
  listTodoItems,
  updateTodoItem,
} from '../../services/todo.js'

type TodoStatus = 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  conversationId?: string
  content: string
  status: TodoStatus
  createdAt: string
  updatedAt: string
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
  if (!conversationId) {
    return {
      action: args.action,
      changed: false,
      todos: [],
      message: 'Todo operation skipped: missing conversation context.',
    }
  }

  if (args.action === 'list') {
    const todos = await listTodoItems(conversationId)
    return {
      action: 'list',
      changed: false,
      todos,
      message: `Listed ${todos.length} todo item(s).`,
    }
  }

  if (args.action === 'add') {
    const content = args.content?.trim() || ''
    if (!content) {
      return {
        action: 'add',
        changed: false,
        todos: await listTodoItems(conversationId),
        message: 'Add skipped: content is required.',
      }
    }

    await addTodoItem(conversationId, content, args.status ?? 'in_progress')
    const todos = await listTodoItems(conversationId)
    return {
      action: 'add',
      changed: true,
      todos,
      message: 'Added 1 todo item.',
    }
  }

  if (args.action === 'update') {
    const taskId = args.taskId?.trim()
    if (!taskId) {
      return {
        action: 'update',
        changed: false,
        todos: await listTodoItems(conversationId),
        message: 'Update skipped: taskId is required.',
      }
    }

    const currentTodos = await listTodoItems(conversationId)
    const target = currentTodos.find(t => t.id === taskId)
    if (!target) {
      return {
        action: 'update',
        changed: false,
        todos: currentTodos,
        message: `Update skipped: task ${taskId} not found.`,
      }
    }

    const nextContent = args.content?.trim()
    const hasContentUpdate = typeof nextContent === 'string' && nextContent.length > 0
    const hasStatusUpdate = !!args.status

    if (!hasContentUpdate && !hasStatusUpdate) {
      return {
        action: 'update',
        changed: false,
        todos: currentTodos,
        message: 'Update skipped: no fields to update.',
      }
    }

    await updateTodoItem(conversationId, taskId, {
      content: hasContentUpdate ? nextContent! : undefined,
      status: hasStatusUpdate ? args.status! : undefined,
    })

    return {
      action: 'update',
      changed: true,
      todos: await listTodoItems(conversationId),
      message: `Updated task ${taskId}.`,
    }
  }

  if (args.action === 'delete') {
    const taskId = args.taskId?.trim()
    if (!taskId) {
      return {
        action: 'delete',
        changed: false,
        todos: await listTodoItems(conversationId),
        message: 'Delete skipped: taskId is required.',
      }
    }

    const changed = await deleteTodoItem(conversationId, taskId)
    const todos = await listTodoItems(conversationId)
    return {
      action: 'delete',
      changed,
      todos,
      message: changed ? `Deleted task ${taskId}.` : `Delete skipped: task ${taskId} not found.`,
    }
  }

  const clearTarget = args.clearTarget ?? 'completed'
  if (clearTarget === 'all') {
    const removed = await clearTodoItems(conversationId, 'all')
    return {
      action: 'clear',
      changed: removed > 0,
      todos: [],
      message: removed > 0 ? 'Cleared all todo items.' : 'Todo list is already empty.',
    }
  }

  const removed = await clearTodoItems(conversationId, 'completed')
  const todos = await listTodoItems(conversationId)
  return {
    action: 'clear',
    changed: removed > 0,
    todos,
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
