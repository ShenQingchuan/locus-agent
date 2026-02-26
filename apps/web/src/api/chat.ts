import type {
  AddToWhitelistPayload,
  Conversation,
  CoreMessage,
  ListConversationsResponse,
  LLMProviderType,
  MCPServersConfig,
  MCPServerStatus,
  Message,
  RiskLevel,
  SSEEvent,
  ToolCall,
  ToolResult,
  WhitelistRule,
} from '@locus-agent/shared'

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  /** 服务端预计算的建议匹配前缀 */
  suggestedPattern?: string
  /** 服务端预计算的风险等级 */
  riskLevel?: RiskLevel
}

export interface QuestionAnswer {
  question: string
  answer: string
}

export interface PendingQuestion {
  toolCallId: string
  questions: Array<{
    question: string
    options: string[]
    multiple?: boolean
  }>
}

export interface ChatStreamOptions {
  conversationId: string
  message: string
  messages?: CoreMessage[]
  confirmMode?: boolean
  thinkingMode?: boolean
  onReasoningDelta?: (delta: string) => void
  onTextDelta?: (delta: string) => void
  onToolCallStart?: (toolCall: ToolCall) => void
  onToolCallResult?: (toolResult: ToolResult) => void
  onToolPendingApproval?: (approval: PendingApproval) => void
  onQuestionPending?: (question: PendingQuestion) => void
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void
  onDone?: (messageId: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number }, model?: string) => void
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
    onReasoningDelta,
    onTextDelta,
    onToolCallStart,
    onToolCallResult,
    onToolPendingApproval,
    onQuestionPending,
    onToolOutputDelta,
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
    const response = await fetch(`/api/chat`, {
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
          case 'reasoning-delta':
            onReasoningDelta?.(event.reasoningDelta)
            break
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
              suggestedPattern: event.suggestedPattern,
              riskLevel: event.riskLevel,
            })
            break
          case 'question-pending':
            onQuestionPending?.({
              toolCallId: event.toolCallId,
              questions: event.questions,
            })
            break
          case 'tool-output-delta':
            onToolOutputDelta?.(event.toolCallId, event.stream, event.delta)
            break
          case 'done':
            onDone?.(event.messageId, event.usage, event.model)
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
          case 'reasoning-delta':
            onReasoningDelta?.(event.reasoningDelta)
            break
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
              suggestedPattern: event.suggestedPattern,
              riskLevel: event.riskLevel,
            })
            break
          case 'question-pending':
            onQuestionPending?.({
              toolCallId: event.toolCallId,
              questions: event.questions,
            })
            break
          case 'tool-output-delta':
            onToolOutputDelta?.(event.toolCallId, event.stream, event.delta)
            break
          case 'done':
            onDone?.(event.messageId, event.usage, event.model)
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
    await fetch(`/api/chat/abort`, {
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
  switchToYolo?: boolean,
  addToWhitelist?: AddToWhitelistPayload,
): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        toolCallId,
        approved,
        switchToYolo,
        addToWhitelist,
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
 * Submit answers to an ask_question tool call
 */
export async function answerQuestion(
  toolCallId: string,
  answers: QuestionAnswer[],
): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toolCallId, answers }),
    })

    if (!response.ok) {
      console.error('Failed to answer question:', response.statusText)
      return false
    }

    const result = await response.json()
    return result.success
  }
  catch (error) {
    console.error('Failed to answer question:', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Whitelist API
// ---------------------------------------------------------------------------

/**
 * Fetch whitelist rules
 */
export async function fetchWhitelistRules(conversationId?: string): Promise<WhitelistRule[]> {
  try {
    const params = conversationId ? `?conversationId=${conversationId}` : ''
    const response = await fetch(`/api/chat/whitelist${params}`)
    if (!response.ok)
      return []
    const data = await response.json()
    return data.rules ?? []
  }
  catch (error) {
    console.error('Failed to fetch whitelist rules:', error)
    return []
  }
}

/**
 * Delete a whitelist rule
 */
export async function deleteWhitelistRule(ruleId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/whitelist/${ruleId}`, {
      method: 'DELETE',
    })
    if (!response.ok)
      return false
    const data = await response.json()
    return data.success
  }
  catch (error) {
    console.error('Failed to delete whitelist rule:', error)
    return false
  }
}

/**
 * Fetch all conversations
 */
export async function fetchConversations(): Promise<Conversation[]> {
  try {
    const response = await fetch(`/api/conversations`, {
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

    // Server returns flat: { id, title, confirmMode, createdAt, updatedAt, messages }
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

/**
 * Create a new conversation
 */
export async function createConversation(title?: string): Promise<Conversation | null> {
  try {
    const response = await fetch(`/api/conversations`, {
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

/**
 * Update a conversation (title, confirmMode, etc.)
 */
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

/**
 * Delete a conversation
 */
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

/**
 * Fetch current LLM settings including model context window
 */
export async function fetchSettings(): Promise<{
  provider: string
  model: string
  contextWindow: number
} | null> {
  try {
    const response = await fetch(`/api/settings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch settings:', response.statusText)
      return null
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch settings:', error)
    return null
  }
}

export interface SettingsConfigResponse {
  setupCompleted: boolean
  provider: LLMProviderType
  hasApiKey: boolean
  apiKeyMasked: string | null
  apiKeys: Partial<Record<LLMProviderType, string | null>>
  apiBase?: string
  model?: string
  port: number
  runtime?: { provider: string, model: string, contextWindow: number }
}

export async function fetchSettingsConfig(): Promise<SettingsConfigResponse | null> {
  try {
    const response = await fetch(`/api/settings/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch settings config:', response.statusText)
      return null
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch settings config:', error)
    return null
  }
}

export interface UpdateSettingsConfigRequest {
  provider?: LLMProviderType
  apiKey?: string
  apiBase?: string
  model?: string
  port?: number
}

export async function updateSettingsConfig(
  data: UpdateSettingsConfigRequest,
): Promise<{
  success: boolean
  message?: string
  requiresRestart?: boolean
  config?: SettingsConfigResponse
}> {
  try {
    const response = await fetch(`/api/settings/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const json = await response.json().catch(() => null) as any

    if (!response.ok) {
      const msg = json?.message || response.statusText || 'Request failed'
      const friendly = response.status >= 500 ? '服务器内部错误，请稍后重试' : msg
      return {
        success: false,
        message: friendly,
      }
    }

    if (json?.success === false) {
      return {
        success: false,
        message: json?.message || '保存失败',
      }
    }

    return {
      success: true,
      requiresRestart: !!json?.requiresRestart,
      config: json?.config as SettingsConfigResponse | undefined,
    }
  }
  catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

export async function fetchMCPConfig(): Promise<MCPServersConfig | null> {
  try {
    const response = await fetch('/api/mcp/config')
    if (!response.ok)
      return null
    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch MCP config:', error)
    return null
  }
}

export async function updateMCPConfig(
  config: MCPServersConfig,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const response = await fetch('/api/mcp/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const json = await response.json().catch(() => null) as any
    if (!response.ok || json?.success === false) {
      return { success: false, message: json?.message || 'Failed to update MCP config' }
    }
    return { success: true, status: json?.status }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}

export async function fetchMCPStatus(): Promise<MCPServerStatus[]> {
  try {
    const response = await fetch('/api/mcp/status')
    if (!response.ok)
      return []
    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch MCP status:', error)
    return []
  }
}

export async function restartMCPServer(
  name?: string,
): Promise<{ success: boolean, message?: string, status?: MCPServerStatus[] }> {
  try {
    const url = name ? `/api/mcp/restart/${encodeURIComponent(name)}` : '/api/mcp/restart'
    const response = await fetch(url, { method: 'POST' })
    const json = await response.json().catch(() => null) as any
    if (!response.ok || json?.success === false) {
      return { success: false, message: json?.message || 'Failed to restart MCP server' }
    }
    return { success: true, status: json?.status }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}
