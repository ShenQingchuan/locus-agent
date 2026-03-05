import type { AddToWhitelistPayload } from '@locus-agent/shared'
import type { ChatStreamOptions, ConversationPlansResponse, QuestionAnswer, SSEEvent } from './chat-types.js'

export type { ChatStreamOptions, ConversationPlansResponse, DelegateDeltaEvent, PendingApproval, PendingQuestion, QuestionAnswer } from './chat-types.js'

const abortControllers = new Map<string, AbortController>()

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

function dispatchEvent(
  event: SSEEvent,
  handlers: {
    onReasoningDelta?: (delta: string) => void
    onTextDelta?: (delta: string) => void
    onToolCallStart?: (c: import('@locus-agent/shared').ToolCall) => void
    onToolCallResult?: (r: import('@locus-agent/shared').ToolResult) => void
    onToolPendingApproval?: (a: import('./chat-types.js').PendingApproval) => void
    onQuestionPending?: (q: import('./chat-types.js').PendingQuestion) => void
    onToolOutputDelta?: (id: string, stream: 'stdout' | 'stderr', delta: string) => void
    onDelegateDelta?: (e: import('./chat-types.js').DelegateDeltaEvent) => void
    onDone?: (id: string, usage?: { promptTokens: number, completionTokens: number, totalTokens: number }, model?: string) => void
    onError?: (code: string, message: string) => void
  },
): void {
  switch (event.type) {
    case 'reasoning-delta':
      handlers.onReasoningDelta?.(event.reasoningDelta)
      break
    case 'text-delta':
      handlers.onTextDelta?.(event.textDelta)
      break
    case 'tool-call-start':
      handlers.onToolCallStart?.(event.toolCall)
      break
    case 'tool-call-result':
      handlers.onToolCallResult?.(event.toolResult)
      break
    case 'tool-pending-approval':
      handlers.onToolPendingApproval?.({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        suggestedPattern: event.suggestedPattern,
        riskLevel: event.riskLevel,
      })
      break
    case 'question-pending':
      handlers.onQuestionPending?.({
        toolCallId: event.toolCallId,
        questions: event.questions,
      })
      break
    case 'tool-output-delta':
      handlers.onToolOutputDelta?.(event.toolCallId, event.stream, event.delta)
      break
    case 'delegate-delta':
      handlers.onDelegateDelta?.({ toolCallId: event.toolCallId, delta: event.delta })
      break
    case 'done':
      handlers.onDone?.(event.messageId, event.usage, event.model)
      break
    case 'error':
      handlers.onError?.(event.code, event.message)
      break
  }
}

export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const {
    conversationId,
    space = 'chat',
    projectKey,
    message,
    messages = [],
    confirmMode = true,
    thinkingMode,
    codingMode,
    planBinding,
    messageMetadata,
    onReasoningDelta,
    onTextDelta,
    onToolCallStart,
    onToolCallResult,
    onToolPendingApproval,
    onQuestionPending,
    onToolOutputDelta,
    onDelegateDelta,
    onDone,
    onError,
  } = options

  const existingController = abortControllers.get(conversationId)
  if (existingController) {
    existingController.abort()
  }

  const controller = new AbortController()
  abortControllers.set(conversationId, controller)

  const handlers = {
    onReasoningDelta,
    onTextDelta,
    onToolCallStart,
    onToolCallResult,
    onToolPendingApproval,
    onQuestionPending,
    onToolOutputDelta,
    onDelegateDelta,
    onDone,
    onError,
  }

  try {
    const response = await fetch(`/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        space,
        projectKey,
        message,
        ...(messages && messages.length > 0 ? { messages } : {}),
        confirmMode,
        thinkingMode,
        codingMode,
        planBinding,
        messageMetadata,
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

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine)
          continue

        const event = parseSSELine(trimmedLine)
        if (!event)
          continue

        dispatchEvent(event, handlers)
      }
    }

    if (buffer.trim()) {
      const event = parseSSELine(buffer.trim())
      if (event)
        dispatchEvent(event, handlers)
    }
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      return
    onError?.('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error')
  }
  finally {
    abortControllers.delete(conversationId)
  }
}

export async function fetchConversationPlans(conversationId: string): Promise<ConversationPlansResponse | null> {
  try {
    const response = await fetch(`/api/chat/plans/${conversationId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!response.ok)
      return null
    return await response.json() as ConversationPlansResponse
  }
  catch (error) {
    console.error('Failed to fetch conversation plans:', error)
    return null
  }
}

export async function abortChat(conversationId: string): Promise<void> {
  const controller = abortControllers.get(conversationId)
  if (controller) {
    controller.abort()
    abortControllers.delete(conversationId)
  }

  try {
    await fetch(`/api/chat/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
  }
  catch (error) {
    console.error('Failed to abort chat on server:', error)
  }
}

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
      headers: { 'Content-Type': 'application/json' },
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

export async function answerQuestion(
  toolCallId: string,
  answers: QuestionAnswer[],
): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
