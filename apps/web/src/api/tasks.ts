import type {
  CreateTaskInput,
  ListTasksResponse,
  ReorderTaskInput,
  Task,
  UpdateTaskInput,
} from '@univedge/locus-agent-sdk'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchTasks(projectKey: string): Promise<Task[]> {
  const { tasks } = await request<ListTasksResponse>(
    `/tasks?projectKey=${encodeURIComponent(projectKey)}`,
  )
  return tasks
}

export async function fetchTask(id: string): Promise<{ task: Task, conversationIds: string[] }> {
  return request(`/tasks/${id}`)
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/tasks/${id}`, { method: 'DELETE' })
}

export async function reorderTask(id: string, input: ReorderTaskInput): Promise<Task> {
  return request<Task>(`/tasks/${id}/reorder`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function linkTaskConversation(taskId: string, conversationId: string): Promise<void> {
  await request(`/tasks/${taskId}/link-conversation`, {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  })
}
