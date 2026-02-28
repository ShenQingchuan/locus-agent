import type { Conversation, NewConversation } from '../db/schema.js'
import { desc, eq } from 'drizzle-orm'
import { conversations, db } from '../db/index.js'

/**
 * 创建新会话
 * @param title 会话标题
 * @param id 可选的会话 ID，如果不提供则自动生成
 */
export async function createConversation(title?: string, id?: string): Promise<Conversation> {
  const conversationId = id || crypto.randomUUID()
  const now = new Date()

  const newConversation: NewConversation = {
    id: conversationId,
    title: title || '新会话',
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(conversations).values(newConversation)

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))

  return conversation
}

/**
 * 获取会话详情
 */
export async function getConversation(id: string): Promise<Conversation | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))

  return conversation || null
}

/**
 * 获取会话详情（包含消息）
 */
export async function getConversationWithMessages(id: string): Promise<{
  conversation: Conversation
  messages: Awaited<ReturnType<typeof import('./message.js').getMessages>>
} | null> {
  const conversation = await getConversation(id)

  if (!conversation) {
    return null
  }

  const { getMessages } = await import('./message.js')
  const conversationMessages = await getMessages(id)

  return {
    conversation,
    messages: conversationMessages,
  }
}

/**
 * 列出所有会话（按更新时间倒序）
 */
export async function listConversations(): Promise<Conversation[]> {
  const result = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))

  return result
}

/**
 * 更新会话
 */
export async function updateConversation(
  id: string,
  data: { title?: string, confirmMode?: boolean },
  options?: { touch?: boolean },
): Promise<Conversation | null> {
  const existing = await getConversation(id)

  if (!existing) {
    return null
  }

  const touch = options?.touch ?? true
  const updates: Partial<NewConversation> & { updatedAt?: Date } = {}
  if (touch)
    updates.updatedAt = new Date()
  if (data.title !== undefined)
    updates.title = data.title
  if (data.confirmMode !== undefined)
    updates.confirmMode = data.confirmMode

  await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, id))

  return getConversation(id)
}

/**
 * 更新会话的 updatedAt 时间
 */
export async function touchConversation(id: string): Promise<void> {
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id))
}

/**
 * 删除会话（级联删除消息）
 */
export async function deleteConversation(id: string): Promise<boolean> {
  const existing = await getConversation(id)

  if (!existing) {
    return false
  }

  // 由于 schema 中配置了 onDelete: 'cascade'，消息会自动删除
  await db.delete(conversations).where(eq(conversations.id, id))

  return true
}

/**
 * 检查会话是否存在
 */
export async function conversationExists(id: string): Promise<boolean> {
  const [result] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, id))

  return !!result
}
