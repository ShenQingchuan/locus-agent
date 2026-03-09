import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { todoItems } from '../db/schema.js'

export type TodoStatus = 'in_progress' | 'completed'

export interface TodoItem {
  id: string
  conversationId: string
  content: string
  status: TodoStatus
  createdAt: string
  updatedAt: string
}

function toTodoItem(row: typeof todoItems.$inferSelect): TodoItem {
  return {
    id: row.id,
    conversationId: row.conversationId,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listTodoItems(conversationId: string): Promise<TodoItem[]> {
  const rows = await db
    .select()
    .from(todoItems)
    .where(eq(todoItems.conversationId, conversationId))
    .orderBy(desc(todoItems.createdAt))

  return rows.map(toTodoItem)
}

export async function addTodoItem(conversationId: string, content: string, status: TodoStatus): Promise<TodoItem> {
  const id = `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date()
  await db.insert(todoItems).values({
    id,
    conversationId,
    content,
    status,
    createdAt: now,
    updatedAt: now,
  })

  const [inserted] = await db
    .select()
    .from(todoItems)
    .where(and(eq(todoItems.conversationId, conversationId), eq(todoItems.id, id)))

  if (!inserted) {
    throw new Error('Failed to load inserted todo item')
  }

  return toTodoItem(inserted)
}

export async function updateTodoItem(
  conversationId: string,
  id: string,
  input: { content?: string, status?: TodoStatus },
): Promise<TodoItem | null> {
  const [existing] = await db
    .select()
    .from(todoItems)
    .where(and(eq(todoItems.conversationId, conversationId), eq(todoItems.id, id)))

  if (!existing) {
    return null
  }

  const content = input.content ?? existing.content
  const status = input.status ?? existing.status

  await db
    .update(todoItems)
    .set({
      content,
      status,
      updatedAt: new Date(),
    })
    .where(and(eq(todoItems.conversationId, conversationId), eq(todoItems.id, id)))

  return {
    ...toTodoItem(existing),
    content,
    status,
    updatedAt: new Date().toISOString(),
  }
}

export async function deleteTodoItem(conversationId: string, id: string): Promise<boolean> {
  const before = await listTodoItems(conversationId)
  await db
    .delete(todoItems)
    .where(and(eq(todoItems.conversationId, conversationId), eq(todoItems.id, id)))
  const after = await listTodoItems(conversationId)
  return after.length !== before.length
}

export async function clearTodoItems(conversationId: string, target: 'all' | 'completed'): Promise<number> {
  const before = await listTodoItems(conversationId)

  if (target === 'all') {
    await db.delete(todoItems).where(eq(todoItems.conversationId, conversationId))
  }
  else {
    await db
      .delete(todoItems)
      .where(and(eq(todoItems.conversationId, conversationId), eq(todoItems.status, 'completed')))
  }

  const after = await listTodoItems(conversationId)
  return before.length - after.length
}
