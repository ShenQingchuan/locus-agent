import type { ToolCall, ToolResult } from './tool.js'

/**
 * 消息角色类型
 * 符合 Vercel AI SDK 的角色定义
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

/**
 * 消息元数据（用于标记自动触发等非用户手动输入的消息）
 */
export interface MessageMetadata {
  /** 触发类型标识 — 携带此字段的消息不在 UI 中渲染气泡 */
  trigger?: string
}

/**
 * 消息类型定义
 * 符合 Vercel AI SDK 的消息格式
 */
export interface Message {
  /** 消息唯一标识 */
  id: string
  /** 所属会话 ID */
  conversationId: string
  /** 消息角色 */
  role: MessageRole
  /** 消息文本内容 */
  content: string
  /** 思考过程内容 */
  reasoning?: string | null
  /** 生成该助手消息使用的模型（格式：provider/model） */
  model?: string | null
  /** 工具调用列表（assistant 消息可能包含） */
  toolCalls?: ToolCall[]
  /** 工具执行结果列表（tool 消息包含） */
  toolResults?: ToolResult[]
  /** Token 使用统计信息 */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } | null
  /** 消息元数据 */
  metadata?: MessageMetadata | null
  /** 创建时间 */
  createdAt: Date
}

/**
 * 用户消息
 */
export interface UserMessage {
  role: 'user'
  content: string
}

/**
 * 助手消息
 */
export interface AssistantMessage {
  role: 'assistant'
  content: string
  toolCalls?: ToolCall[]
}

/**
 * 系统消息
 */
export interface SystemMessage {
  role: 'system'
  content: string
}

/**
 * 工具消息
 */
export interface ToolMessage {
  role: 'tool'
  content: string
  toolResults: ToolResult[]
}

/**
 * 核心消息类型（用于 AI SDK）
 */
export type CoreMessage = UserMessage | AssistantMessage | SystemMessage | ToolMessage
