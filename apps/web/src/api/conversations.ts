import type { Conversation, ListConversationsResponse, Message } from '@locus-agent/agent-sdk'

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

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch conversations:', response.statusText)
      return []
    }

    const data: ListConversationsResponse = await response.json()
    return data.conversations
  }
  catch (error) {
    console.error('Failed to fetch conversations:', error)
    return []
  }
}

export async function fetchConversation(
  conversationId: string,
): Promise<{ conversation: Conversation, messages: Message[] } | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch conversation:', response.statusText)
      return null
    }

    const data = await response.json()
    const { messages: msgs, ...conversation } = data
    return {
      conversation: conversation as Conversation,
      messages: msgs as Message[],
    }
  }
  catch (error) {
    console.error('Failed to fetch conversation:', error)
    return null
  }
}

export async function createConversation(options?: {
  title?: string
  space?: 'chat' | 'coding'
  projectKey?: string
}): Promise<Conversation | null> {
  try {
    const response = await fetch(`/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: options?.title,
        space: options?.space,
        projectKey: options?.projectKey,
      }),
    })

    if (!response.ok) {
      console.error('Failed to create conversation:', response.statusText)
      return null
    }

    const data = await response.json()
    return data.conversation
  }
  catch (error) {
    console.error('Failed to create conversation:', error)
    return null
  }
}

export async function truncateMessages(
  conversationId: string,
  keepCount: number,
): Promise<boolean> {
  try {
    const response = await fetch(
      `/api/conversations/${conversationId}/truncate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keepCount }),
      },
    )

    if (!response.ok) {
      console.error('Failed to truncate messages:', response.statusText)
      return false
    }

    const result = await response.json()
    return result.success
  }
  catch (error) {
    console.error('Failed to truncate messages:', error)
    return false
  }
}

export async function updateConversation(
  conversationId: string,
  data: { title?: string, confirmMode?: boolean },
): Promise<Conversation | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      console.error('Failed to update conversation:', response.statusText)
      return null
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to update conversation:', error)
    return null
  }
}

export async function generateConversationTitle(conversationId: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}/generate-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to generate title:', response.statusText)
      return null
    }

    const data = await response.json()
    return data.title ?? null
  }
  catch (error) {
    console.error('Failed to generate title:', error)
    return null
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to delete conversation:', response.statusText)
      return false
    }

    const result = await response.json()
    return result.success
  }
  catch (error) {
    console.error('Failed to delete conversation:', error)
    return false
  }
}
