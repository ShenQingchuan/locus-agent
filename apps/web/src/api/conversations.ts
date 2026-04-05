import type { Conversation, ListConversationsResponse, Message } from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

export async function fetchConversations(scope?: {
  space?: 'chat' | 'coding'
  projectKey?: string
}): Promise<Conversation[]> {
  try {
    const params = new URLSearchParams()
    if (scope?.space)
      params.set('space', scope.space)
    if (scope?.projectKey)
      params.set('projectKey', scope.projectKey)

    const query = params.toString()
    const url = query ? `/api/conversations?${query}` : '/api/conversations'

    const data = await apiClient.get<ListConversationsResponse>(url)
    return data.conversations
  }
  catch {
    return []
  }
}

export async function fetchConversation(
  conversationId: string,
): Promise<{ conversation: Conversation, messages: Message[] } | null> {
  try {
    const data = await apiClient.get<Conversation & { messages: Message[] }>(
      `/api/conversations/${conversationId}`,
    )
    const { messages: msgs, ...conversation } = data
    return {
      conversation,
      messages: msgs,
    }
  }
  catch {
    return null
  }
}

export async function createConversation(options?: {
  title?: string
  space?: 'chat' | 'coding'
  projectKey?: string
}): Promise<Conversation | null> {
  try {
    const data = await apiClient.post<{
      conversation: Conversation
    }>('/api/conversations', {
      title: options?.title,
      space: options?.space,
      projectKey: options?.projectKey,
    })
    return data.conversation
  }
  catch {
    return null
  }
}

export async function truncateMessages(
  conversationId: string,
  keepCount: number,
): Promise<boolean> {
  try {
    const result = await apiClient.post<{ success: boolean }>(
      `/api/conversations/${conversationId}/truncate`,
      { keepCount },
    )
    return result.success
  }
  catch {
    return false
  }
}

export async function updateConversation(
  conversationId: string,
  data: { title?: string, confirmMode?: boolean },
): Promise<Conversation | null> {
  try {
    return await apiClient.patch<Conversation>(`/api/conversations/${conversationId}`, data)
  }
  catch {
    return null
  }
}

export async function generateConversationTitle(conversationId: string): Promise<string | null> {
  try {
    const data = await apiClient.post<{ title?: string }>(`/api/conversations/${conversationId}/generate-title`)
    return data.title ?? null
  }
  catch {
    return null
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const result = await apiClient.del<{ success: boolean }>(`/api/conversations/${conversationId}`)
    return result.success
  }
  catch {
    return false
  }
}
