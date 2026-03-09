/**
 * 会话类型定义
 */
export type ConversationSpace = 'chat' | 'coding'

export interface Conversation {
  /** 会话唯一标识 */
  id: string
  /** 会话标题 */
  title: string
  /** 会话所属空间 */
  space: ConversationSpace
  /** 项目维度分组键（仅 coding 空间使用） */
  projectKey?: string | null
  /** 是否需要确认工具执行（true=需要确认，false=yolo 模式） */
  confirmMode: boolean
  /** 创建时间 */
  createdAt: Date
  /** 更新时间 */
  updatedAt: Date
}

/**
 * 创建会话的请求参数
 */
export interface CreateConversationInput {
  title?: string
  space?: ConversationSpace
  projectKey?: string
}

/**
 * 更新会话的请求参数
 */
export interface UpdateConversationInput {
  title?: string
  confirmMode?: boolean
}

/**
 * 会话列表查询参数
 */
export interface ListConversationsInput {
  space?: ConversationSpace
  projectKey?: string
}
