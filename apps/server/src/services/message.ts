import type { ToolCall, ToolResult } from '@locus-agent/shared'
import type { Message, NewMessage } from '../db/schema.js'
import { asc, desc, eq } from 'drizzle-orm'
import { db, messages } from '../db/index.js'
import { touchConversation } from './conversation.js'

/**
 * 消息输入类型
 */
export interface AddMessageInput {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  /** 思考过程内容 (Kimi K2.5 原生 reasoning_content) */
  reasoning?: string
  /** 助手消息所使用的模型（格式：provider/model） */
  model?: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 添加消息到会话
 */
export async function addMessage(
  conversationId: string,
  message: AddMessageInput,
): Promise<Message> {
  const id = crypto.randomUUID()
  const now = new Date()

  const newMessage: NewMessage = {
    id,
    conversationId,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning ?? null,
    model: message.model ?? null,
    toolCalls: message.toolCalls ?? null,
    toolResults: message.toolResults ?? null,
    usage: message.usage ?? null,
    createdAt: now,
  }

  await db.insert(messages).values(newMessage)

  // 更新会话的 updatedAt 时间
  await touchConversation(conversationId)

  const [savedMessage] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))

  return savedMessage
}

/**
 * 批量添加消息
 */
export async function addMessages(
  conversationId: string,
  messageList: AddMessageInput[],
): Promise<Message[]> {
  const now = new Date()

  const newMessages: NewMessage[] = messageList.map(message => ({
    id: crypto.randomUUID(),
    conversationId,
    role: message.role,
    content: message.content,
    reasoning: message.reasoning ?? null,
    model: message.model ?? null,
    toolCalls: message.toolCalls ?? null,
    toolResults: message.toolResults ?? null,
    usage: message.usage ?? null,
    createdAt: now,
  }))

  if (newMessages.length > 0) {
    await db.insert(messages).values(newMessages)
    await touchConversation(conversationId)
  }

  // 获取所有插入的消息
  const ids = newMessages.map(m => m.id!)
  const savedMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  // 只返回刚插入的消息
  return savedMessages.filter(m => ids.includes(m.id))
}

/**
 * 获取会话的所有消息（按创建时间升序）
 */
export async function getMessages(conversationId: string): Promise<Message[]> {
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  return result
}

/**
 * 获取最近 N 条消息（按创建时间降序，返回时再反转为升序）
 */
export async function getLastNMessages(
  conversationId: string,
  n: number,
): Promise<Message[]> {
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(n)

  // 反转为升序（最旧的在前）
  return result.reverse()
}

/**
 * 获取单条消息
 */
export async function getMessage(id: string): Promise<Message | null> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, id))

  return message || null
}

/**
 * 删除消息
 */
export async function deleteMessage(id: string): Promise<boolean> {
  const message = await getMessage(id)

  if (!message) {
    return false
  }

  await db.delete(messages).where(eq(messages.id, id))

  // 更新会话的 updatedAt 时间
  await touchConversation(message.conversationId)

  return true
}

/**
 * 截断会话消息：只保留前 keepCount 条消息，删除其余的
 * 用于重试场景：删除指定位置及之后的所有消息
 */
export async function truncateMessages(
  conversationId: string,
  keepCount: number,
): Promise<number> {
  // 按创建时间排序获取所有消息
  const allMessages = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  // 需要删除的消息
  const toDelete = allMessages.slice(keepCount)

  if (toDelete.length === 0) {
    return 0
  }

  for (const msg of toDelete) {
    await db.delete(messages).where(eq(messages.id, msg.id))
  }

  await touchConversation(conversationId)
  return toDelete.length
}

/**
 * 替换会话的全部消息（用于 auto-compaction 后持久化压缩结果）
 */
export async function replaceMessages(
  conversationId: string,
  newMessages: AddMessageInput[],
): Promise<void> {
  await db.delete(messages).where(eq(messages.conversationId, conversationId))
  if (newMessages.length > 0) {
    await addMessages(conversationId, newMessages)
  }
}

/**
 * 获取会话的消息数量
 */
export async function getMessageCount(conversationId: string): Promise<number> {
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))

  return result.length
}
