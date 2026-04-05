import type {
  CreateTaskInput,
  ListTasksResponse,
  ReorderTaskInput,
  Task,
  UpdateTaskInput,
} from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

const API_BASE = '/api'

export async function fetchTasks(projectKey: string): Promise<Task[]> {
  const { tasks } = await apiClient.get<ListTasksResponse>(
    `${API_BASE}/tasks?projectKey=${encodeURIComponent(projectKey)}`,
  )
  return tasks
}

export async function fetchTask(id: string): Promise<{ task: Task, conversationIds: string[] }> {
  return apiClient.get(`${API_BASE}/tasks/${id}`)
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return apiClient.post<Task>(`${API_BASE}/tasks`, input)
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return apiClient.patch<Task>(`${API_BASE}/tasks/${id}`, input)
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.del(`${API_BASE}/tasks/${id}`)
}

export async function reorderTask(id: string, input: ReorderTaskInput): Promise<Task> {
  return apiClient.post<Task>(`${API_BASE}/tasks/${id}/reorder`, input)
}

export async function linkTaskConversation(taskId: string, conversationId: string): Promise<void> {
  await apiClient.post(`${API_BASE}/tasks/${taskId}/link-conversation`, { conversationId })
}
