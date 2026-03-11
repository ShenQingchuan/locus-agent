import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import { relations } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  /** 会话所属空间（chat/coding） */
  space: text('space', { enum: ['chat', 'coding'] }).notNull().default('chat'),
  /** 项目维度分组键（仅 coding 空间使用） */
  projectKey: text('project_key'),
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
  index('idx_conversations_space_updated_at').on(t.space, t.updatedAt),
  index('idx_conversations_space_project_updated_at').on(t.space, t.projectKey, t.updatedAt),
])

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content').notNull(),
  attachments: text('attachments', { mode: 'json' }).$type<MessageImageAttachment[] | null>(),
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
  /** 消息元数据（JSON，用于标记触发类型等） */
  metadata: text('metadata', { mode: 'json' }).$type<{ trigger?: string } | null>(),
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

/** 会话待办事项 */
export const todoItems = sqliteTable('todo_items', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_todo_items_conversation_created').on(t.conversationId, t.createdAt),
  index('idx_todo_items_conversation_status').on(t.conversationId, t.status),
])

/** delegate 子任务会话（用于 task_id 续跑） */
export const delegateSessions = sqliteTable('delegate_sessions', {
  taskId: text('task_id').primaryKey(),
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),
  agentName: text('agent_name').notNull(),
  agentType: text('agent_type').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  messages: text('messages', { mode: 'json' }).$type<unknown[]>().notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_delegate_sessions_conversation').on(t.conversationId),
  index('idx_delegate_sessions_updated').on(t.updatedAt),
])

/** CLI 配置存储 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ==================== Knowledge Base ====================

/** 文件夹（支持嵌套） */
export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id').references((): any => folders.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_folders_parent_id').on(t.parentId),
])

/** 笔记主表 */
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  /** Markdown 纯文本（用于搜索、AI 上下文注入、导出） */
  content: text('content').notNull().default(''),
  /** ProseKit EditorState JSON（精确还原编辑器状态） */
  editorState: text('editor_state', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  /** LLM-generated summary (reserved for future use, currently empty) */
  summary: text('summary'),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_notes_folder_id').on(t.folderId),
  index('idx_notes_updated_at').on(t.updatedAt),
])

/** 标签 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

/** 笔记-标签关联 */
export const noteTags = sqliteTable('note_tags', {
  noteId: text('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  tagId: text('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
}, t => [
  primaryKey({ columns: [t.noteId, t.tagId] }),
  index('idx_note_tags_tag_id').on(t.tagId),
])

/** 笔记-对话来源关联 */
export const noteConversations = sqliteTable('note_conversations', {
  noteId: text('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
}, t => [
  primaryKey({ columns: [t.noteId, t.conversationId] }),
])

// ==================== Relations ====================

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  noteConversations: many(noteConversations),
  todoItems: many(todoItems),
  delegateSessions: many(delegateSessions),
}))

export const delegateSessionsRelations = relations(delegateSessions, ({ one }) => ({
  conversation: one(conversations, {
    fields: [delegateSessions.conversationId],
    references: [conversations.id],
  }),
}))

export const todoItemsRelations = relations(todoItems, ({ one }) => ({
  conversation: one(conversations, {
    fields: [todoItems.conversationId],
    references: [conversations.id],
  }),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'folderParent',
  }),
  children: many(folders, { relationName: 'folderParent' }),
  notes: many(notes),
}))

export const notesRelations = relations(notes, ({ one, many }) => ({
  folder: one(folders, {
    fields: [notes.folderId],
    references: [folders.id],
  }),
  noteTags: many(noteTags),
  noteConversations: many(noteConversations),
}))

export const tagsRelations = relations(tags, ({ many }) => ({
  noteTags: many(noteTags),
}))

export const noteTagsRelations = relations(noteTags, ({ one }) => ({
  note: one(notes, {
    fields: [noteTags.noteId],
    references: [notes.id],
  }),
  tag: one(tags, {
    fields: [noteTags.tagId],
    references: [tags.id],
  }),
}))

export const noteConversationsRelations = relations(noteConversations, ({ one }) => ({
  note: one(notes, {
    fields: [noteConversations.noteId],
    references: [notes.id],
  }),
  conversation: one(conversations, {
    fields: [noteConversations.conversationId],
    references: [conversations.id],
  }),
}))

// ==================== Kanban Tasks ====================

/** Spec-driven 任务（看板卡片） */
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  /** 任务标题（卡片上显示） */
  title: text('title').notNull(),
  /** Markdown Spec 说明 */
  spec: text('spec').notNull().default(''),
  /** 需求可复用编辑上下文（Markdown） */
  contextMarkdown: text('context_markdown').notNull().default(''),
  /** 看板列状态 */
  status: text('status', { enum: ['backlog', 'in_progress', 'done'] }).notNull().default('backlog'),
  /** 优先级：0=无, 1=低, 2=中, 3=高 */
  priority: integer('priority').notNull().default(0),
  /** 列内排序序号（越小越靠前） */
  sortOrder: integer('sort_order').notNull().default(0),
  /** 项目维度分组键（同 conversations.projectKey） */
  projectKey: text('project_key').notNull(),
  /** 主关联对话 ID */
  conversationId: text('conversation_id')
    .references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_tasks_project_status_sort').on(t.projectKey, t.status, t.sortOrder),
  index('idx_tasks_conversation_id').on(t.conversationId),
])

/** 任务-对话关联（多对多，支持一任务多对话） */
export const taskConversations = sqliteTable('task_conversations', {
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
}, t => [
  primaryKey({ columns: [t.taskId, t.conversationId] }),
])

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  primaryConversation: one(conversations, {
    fields: [tasks.conversationId],
    references: [conversations.id],
  }),
  taskConversations: many(taskConversations),
}))

export const taskConversationsRelations = relations(taskConversations, ({ one }) => ({
  task: one(tasks, {
    fields: [taskConversations.taskId],
    references: [tasks.id],
  }),
  conversation: one(conversations, {
    fields: [taskConversations.conversationId],
    references: [conversations.id],
  }),
}))

// ==================== Plugins ====================

/** Installed plugin records */
export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(),
  /** npm package name OR local file path */
  source: text('source').notNull(),
  sourceType: text('source_type', { enum: ['npm', 'local'] }).notNull(),
  version: text('version').notNull(),
  scope: text('scope', { enum: ['global', 'workspace', 'project', 'conversation'] })
    .notNull()
    .default('global'),
  scopeQualifier: text('scope_qualifier'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  grantedPermissions: text('granted_permissions', { mode: 'json' })
    .$type<string[]>()
    .notNull(),
  config: text('config'),
  installedAt: integer('installed_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, t => [
  index('idx_plugins_enabled').on(t.enabled),
  index('idx_plugins_scope').on(t.scope),
])

// ==================== Types ====================

export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type WhitelistRuleRow = typeof whitelistRules.$inferSelect
export type NewWhitelistRuleRow = typeof whitelistRules.$inferInsert
export type TodoItem = typeof todoItems.$inferSelect
export type NewTodoItem = typeof todoItems.$inferInsert
export type DelegateSession = typeof delegateSessions.$inferSelect
export type NewDelegateSession = typeof delegateSessions.$inferInsert
export type Folder = typeof folders.$inferSelect
export type NewFolder = typeof folders.$inferInsert
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type PluginRow = typeof plugins.$inferSelect
export type NewPluginRow = typeof plugins.$inferInsert
