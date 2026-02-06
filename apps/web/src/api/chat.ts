import type {
  Conversation,
  CoreMessage,
  GetConversationResponse,
  ListConversationsResponse,
  Message,
  SSEEvent,
  ToolCall,
  ToolResult,
} from '@locus-agent/shared'

const API_BASE = 'http://localhost:3000'

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ChatStreamOptions {
  conversationId: string
  message: string
  messages?: CoreMessage[]
  confirmMode?: boolean
  thinkingMode?: boolean
  onTextDelta?: (delta: string) => void
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallResult?: (toolResult: ToolResult) => void
  onToolPendingApproval?: (approval: PendingApproval) => void
  onDone?: (messageId: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number }) => void
  onError?: (code: string, message: string) => void
}

// Store AbortControllers for each conversation
const abortControllers = new Map<string, AbortController>()

/**
 * Parse SSE data from a line
 */
function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: '))
    return null

  const data = line.slice(6)
  if (data === '[DONE]')
    return null

  try {
    return JSON.parse(data) as SSEEvent
  }
  catch {
    console.error('Failed to parse SSE data:', data)
    return null
  }
}

/**
 * Stream chat with SSE
 */
export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const {
    conversationId,
    message,
    messages = [],
    confirmMode = true,
    thinkingMode,
    onTextDelta,
    onToolCallStart,
    onToolCallResult,
    onToolPendingApproval,
    onDone,
    onError,
  } = options

  // Abort any existing stream for this conversation
  const existingController = abortControllers.get(conversationId)
  if (existingController) {
    existingController.abort()
  }

  // Create new AbortController
  const controller = new AbortController()
  abortControllers.set(conversationId, controller)

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        message,
        messages,
        confirmMode,
        thinkingMode,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      onError?.(
        errorData.code || 'HTTP_ERROR',
        errorData.message || `HTTP error: ${response.status}`,
      )
      return
    }

    if (!response.body) {
      onError?.('NO_BODY', 'Response body is empty')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done)
        break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines
      const lines = buffer.split('\n')
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine)
          continue

        const event = parseSSELine(trimmedLine)
        if (!event)
          continue

        switch (event.type) {
          case 'text-delta':
            onTextDelta?.(event.textDelta)
            break
          case 'tool-call-start':
            onToolCallStart?.(event.toolCall)
            break
          case 'tool-call-result':
            onToolCallResult?.(event.toolResult)
            break
          case 'tool-pending-approval':
            onToolPendingApproval?.({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
            })
            break
          case 'done':
            onDone?.(event.messageId, event.usage)
            break
          case 'error':
            onError?.(event.code, event.message)
            break
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const event = parseSSELine(buffer.trim())
      if (event) {
        switch (event.type) {
          case 'text-delta':
            onTextDelta?.(event.textDelta)
            break
          case 'tool-call-start':
            onToolCallStart?.(event.toolCall)
            break
          case 'tool-call-result':
            onToolCallResult?.(event.toolResult)
            break
          case 'tool-pending-approval':
            onToolPendingApproval?.({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
            })
            break
          case 'done':
            onDone?.(event.messageId, event.usage)
            break
          case 'error':
            onError?.(event.code, event.message)
            break
        }
      }
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Request was aborted, this is expected
      return
    }
    onError?.('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error')
  }
  finally {
    abortControllers.delete(conversationId)
  }
}

/**
 * Abort an ongoing chat stream
 */
export async function abortChat(conversationId: string): Promise<void> {
  // Abort client-side stream
  const controller = abortControllers.get(conversationId)
  if (controller) {
    controller.abort()
    abortControllers.delete(conversationId)
  }

  // Notify server to abort
  try {
    await fetch(`${API_BASE}/api/chat/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId }),
    })
  }
  catch (error) {
    console.error('Failed to abort chat on server:', error)
  }
}

/**
 * Approve or reject a tool execution
 */
export async function approveToolCall(
  conversationId: string,
  toolCallId: string,
  approved: boolean,
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/chat/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        toolCallId,
        approved,
      }),
    })

    if (!response.ok) {
      console.error('Failed to approve tool call:', response.statusText)
      return false
    }

    const result = await response.json()
    return result.success
  }
  catch (error) {
    console.error('Failed to approve tool call:', error)
    return false
  }
}

/**
 * Fetch all conversations
 */
export async function fetchConversations(): Promise<Conversation[]> {
  try {
    const response = await fetch(`${API_BASE}/api/conversations`, {
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

/**
 * Fetch a single conversation with its messages
 */
export async function fetchConversation(
  conversationId: string,
): Promise<{ conversation: Conversation, messages: Message[] } | null> {
  try {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch conversation:', response.statusText)
      return null
    }

    const data: GetConversationResponse = await response.json()
    return {
      conversation: data.conversation,
      messages: data.messages,
    }
  }
  catch (error) {
    console.error('Failed to fetch conversation:', error)
    return null
  }
}

/**
 * Create a new conversation
 */
export async function createConversation(title?: string): Promise<Conversation | null> {
  try {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
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

/**
 * Truncate messages in a conversation, keeping only the first N messages
 */
export async function truncateMessages(
  conversationId: string,
  keepCount: number,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/truncate`,
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

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}`, {
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
