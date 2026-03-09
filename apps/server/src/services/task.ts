import type { NewTask, Task } from '../db/schema.js'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { taskConversations, tasks } from '../db/schema.js'

// ==================== Types ====================

export interface CreateTaskInput {
  title: string
  spec?: string
  contextMarkdown?: string
  status?: 'backlog' | 'in_progress' | 'done'
  priority?: number
  projectKey: string
  conversationId?: string
}

export interface UpdateTaskInput {
  title?: string
  spec?: string
  contextMarkdown?: string
  status?: 'backlog' | 'in_progress' | 'done'
  priority?: number
  sortOrder?: number
  conversationId?: string | null
}

// ==================== CRUD ====================

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const id = crypto.randomUUID()
  const now = new Date()
  const status = input.status ?? 'backlog'

  // 取目标列最大 sortOrder + 1
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${tasks.sortOrder}), -1)` })
    .from(tasks)
    .where(and(
      eq(tasks.projectKey, input.projectKey),
      eq(tasks.status, status),
    ))

  const newTask: NewTask = {
    id,
    title: input.title,
    spec: input.spec ?? '',
    contextMarkdown: input.contextMarkdown ?? '',
    status,
    priority: input.priority ?? 0,
    sortOrder: (maxRow?.max ?? -1) + 1,
    projectKey: input.projectKey,
    conversationId: input.conversationId ?? null,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(tasks).values(newTask)

  // 如果有关联对话，同时写入关联表
  if (input.conversationId) {
    await db.insert(taskConversations).values({
      taskId: id,
      conversationId: input.conversationId,
    })
  }

  return getTask(id) as Promise<Task>
}

export async function getTask(id: string): Promise<Task | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))

  return task || null
}

export async function listTasks(projectKey: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectKey, projectKey))
    .orderBy(asc(tasks.sortOrder))
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<Task | null> {
  const existing = await getTask(id)
  if (!existing)
    return null

  const updates: Partial<NewTask> & { updatedAt: Date } = { updatedAt: new Date() }

  if (input.title !== undefined)
    updates.title = input.title
  if (input.spec !== undefined)
    updates.spec = input.spec
  if (input.contextMarkdown !== undefined)
    updates.contextMarkdown = input.contextMarkdown
  if (input.status !== undefined)
    updates.status = input.status
  if (input.priority !== undefined)
    updates.priority = input.priority
  if (input.sortOrder !== undefined)
    updates.sortOrder = input.sortOrder
  if (input.conversationId !== undefined)
    updates.conversationId = input.conversationId

  await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, id))

  return getTask(id)
}

export async function deleteTask(id: string): Promise<boolean> {
  const existing = await getTask(id)
  if (!existing)
    return false

  await db.delete(tasks).where(eq(tasks.id, id))
  return true
}

/**
 * 重排序：将任务移到目标列的目标位置
 */
export async function reorderTask(
  taskId: string,
  targetStatus: 'backlog' | 'in_progress' | 'done',
  targetIndex: number,
): Promise<Task | null> {
  const task = await getTask(taskId)
  if (!task)
    return null

  const isSameColumn = task.status === targetStatus

  if (isSameColumn) {
    // 列内重排：把目标位置及之后的任务 sortOrder 各 +1，再把当前任务放到 targetIndex
    await db
      .update(tasks)
      .set({ sortOrder: sql`${tasks.sortOrder} + 1` })
      .where(and(
        eq(tasks.projectKey, task.projectKey),
        eq(tasks.status, targetStatus),
        gte(tasks.sortOrder, targetIndex),
      ))
  }
  else {
    // 跨列：先在源列中移除后续间隙（可选），在目标列腾出位置
    await db
      .update(tasks)
      .set({ sortOrder: sql`${tasks.sortOrder} + 1` })
      .where(and(
        eq(tasks.projectKey, task.projectKey),
        eq(tasks.status, targetStatus),
        gte(tasks.sortOrder, targetIndex),
      ))
  }

  // 更新任务自身
  await db
    .update(tasks)
    .set({
      status: targetStatus,
      sortOrder: targetIndex,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))

  return getTask(taskId)
}

// ==================== 对话关联 ====================

export async function linkConversation(taskId: string, conversationId: string): Promise<void> {
  await db.insert(taskConversations).values({ taskId, conversationId }).onConflictDoNothing()
}

export async function unlinkConversation(taskId: string, conversationId: string): Promise<void> {
  await db.delete(taskConversations).where(
    and(
      eq(taskConversations.taskId, taskId),
      eq(taskConversations.conversationId, conversationId),
    ),
  )
}

export async function getTaskConversationIds(taskId: string): Promise<string[]> {
  const result = await db
    .select({ conversationId: taskConversations.conversationId })
    .from(taskConversations)
    .where(eq(taskConversations.taskId, taskId))

  return result.map(r => r.conversationId)
}

export async function getLatestTaskByConversation(conversationId: string): Promise<Task | null> {
  const [task] = await db
    .select({ task: tasks })
    .from(taskConversations)
    .innerJoin(tasks, eq(taskConversations.taskId, tasks.id))
    .where(eq(taskConversations.conversationId, conversationId))
    .orderBy(sql`${tasks.updatedAt} DESC`)
    .limit(1)

  if (task?.task)
    return task.task

  const [primaryTask] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.conversationId, conversationId))
    .orderBy(sql`${tasks.updatedAt} DESC`)
    .limit(1)

  return primaryTask ?? null
}
