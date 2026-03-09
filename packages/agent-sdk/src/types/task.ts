/**
 * Kanban 任务 / SpecCoding 相关类型
 */

export type TaskStatus = 'backlog' | 'in_progress' | 'done'

export type TaskPriority = 0 | 1 | 2 | 3

export interface Task {
  id: string
  title: string
  /** Markdown Spec 说明 */
  spec: string
  /** 可复用编辑上下文 Markdown */
  contextMarkdown: string
  status: TaskStatus
  priority: TaskPriority
  sortOrder: number
  projectKey: string
  /** 主关联对话 ID */
  conversationId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateTaskInput {
  title: string
  spec?: string
  contextMarkdown?: string
  status?: TaskStatus
  priority?: TaskPriority
  projectKey: string
  conversationId?: string
}

export interface UpdateTaskInput {
  title?: string
  spec?: string
  contextMarkdown?: string
  status?: TaskStatus
  priority?: TaskPriority
  sortOrder?: number
  conversationId?: string | null
}

export interface ReorderTaskInput {
  targetStatus: TaskStatus
  targetIndex: number
}

// ==================== API 响应 ====================

export interface ListTasksResponse {
  tasks: Task[]
}
