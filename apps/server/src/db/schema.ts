import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** 是否需要确认工具执行（true=需要确认，false=yolo 模式） */
  confirmMode: integer('confirm_mode', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_conversations_updated_at').on(t.updatedAt),
])

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  /** 思考过程内容 */
  reasoning: text('reasoning'),
  /** 助手消息所使用的模型（格式：provider/model） */
  model: text('model'),
  toolCalls: text('tool_calls', { mode: 'json' }).$type<unknown[] | null>(),
  toolResults: text('tool_results', { mode: 'json' }).$type<unknown[] | null>(),
  /** Token 使用统计信息 */
  usage: text('usage', { mode: 'json' }).$type<{
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_messages_conversation_id').on(t.conversationId),
])

/** 工具调用白名单规则 */
export const whitelistRules = sqliteTable('whitelist_rules', {
  id: text('id').primaryKey(),
  /** 工具名称，如 'bash', 'read_file' */
  toolName: text('tool_name').notNull(),
  /** 匹配模式（仅 bash 工具使用）：命令前缀，如 'ls', 'git status' */
  pattern: text('pattern'),
  /** 作用域：session = 关联会话, global = 全局 */
  scope: text('scope', { enum: ['session', 'global'] }).notNull(),
  /** 关联的会话 ID（仅 session 作用域有值） */
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_whitelist_rules_conversation_id').on(t.conversationId),
  index('idx_whitelist_rules_scope').on(t.scope),
])

/** CLI 配置存储 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

// Types
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type WhitelistRuleRow = typeof whitelistRules.$inferSelect
export type NewWhitelistRuleRow = typeof whitelistRules.$inferInsert
