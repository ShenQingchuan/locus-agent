import type { Conversation } from './conversation.js'
import type { CoreMessage, Message } from './message.js'
import type { AddToWhitelistPayload } from './whitelist.js'

export interface PlanBinding {
  mode: 'auto' | 'specific' | 'none'
  filename?: string
}

/**
 * 聊天请求
 */
export interface ChatRequest {
  /** 会话 ID */
  conversationId: string
  /** 会话所属空间（chat/coding） */
  space?: 'chat' | 'coding'
  /** 项目维度分组键（仅 coding 空间使用） */
  projectKey?: string
  /** 用户消息内容 */
  message: string
  /** 历史消息（可选，用于无状态调用） */
  messages?: CoreMessage[]
  /** 是否启用思考模式（默认 true） */
  thinkingMode?: boolean
  /** 是否需要确认工具执行（false = yolo 模式，默认 true） */
  confirmMode?: boolean
  /** Coding 空间模式：build（直接编码）/ plan（先规划再编码） */
  codingMode?: 'build' | 'plan'
  /** Build 模式计划绑定策略：自动/latest、指定文件、或禁用 */
  planBinding?: PlanBinding
}

/**
 * 聊天响应（非流式）
 */
export interface ChatResponse {
  /** 响应消息 */
  message: Message
  /** 会话信息 */
  conversation: Conversation
}

/**
 * 创建会话请求
 */
export interface CreateConversationRequest {
  /** 会话标题 */
  title?: string
  /** 会话所属空间（chat/coding） */
  space?: 'chat' | 'coding'
  /** 项目维度分组键（仅 coding 空间使用） */
  projectKey?: string
}

/**
 * 创建会话响应
 */
export interface CreateConversationResponse {
  conversation: Conversation
}

/**
 * 获取会话列表响应
 */
export interface ListConversationsResponse {
  conversations: Conversation[]
}

/**
 * 获取会话详情响应
 */
export interface GetConversationResponse {
  conversation: Conversation
  messages: Message[]
}

/**
 * 删除会话响应
 */
export interface DeleteConversationResponse {
  success: boolean
}

/**
 * API 错误响应
 */
export interface ApiError {
  /** 错误代码 */
  code: string
  /** 错误消息 */
  message: string
  /** 额外详情 */
  details?: Record<string, unknown>
}

/**
 * API 响应包装器
 */
export type ApiResponse<T>
  = | { success: true, data: T }
    | { success: false, error: ApiError }

/**
 * 工具确认/拒绝请求
 * 用于确认模式下用户批准或拒绝工具执行
 */
export interface ToolApprovalRequest {
  /** 会话 ID */
  conversationId: string
  /** 工具调用 ID */
  toolCallId: string
  /** 是否批准 */
  approved: boolean
  /** 同时切换为 YOLO 模式，后续工具调用直接放行 */
  switchToYolo?: boolean
  /** 同时将该工具调用模式加入白名单 */
  addToWhitelist?: AddToWhitelistPayload
}
