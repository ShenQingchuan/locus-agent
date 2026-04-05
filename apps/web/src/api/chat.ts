import type { AddToWhitelistPayload } from '@univedge/locus-agent-sdk'
import type { ChatStreamOptions, ConversationPlansResponse, QuestionAnswer } from './chat-types.js'
import { consumeSSEStream } from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

export type { ChatStreamOptions, ConversationPlansResponse, PendingApproval, PendingQuestion, QuestionAnswer } from './chat-types.js'
export type { DelegateDeltaEvent } from './chat-types.js'

const abortControllers = new Map<string, AbortController>()

export async function streamChat(options: ChatStreamOptions): Promise<void> {
  const {
    conversationId,
    space = 'chat',
    projectKey,
    workspaceRoot,
    message,
    attachments,
    messages = [],
    confirmMode = true,
    thinkingMode,
    codingMode,
    codingExecutor,
    planBinding,
    messageMetadata,
    ...handlers
  } = options

  const existingController = abortControllers.get(conversationId)
  if (existingController) {
    existingController.abort()
  }

  const controller = new AbortController()
  abortControllers.set(conversationId, controller)

  try {
    const response = await fetch(`/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        space,
        projectKey,
        workspaceRoot,
        message,
        attachments,
        ...(messages && messages.length > 0 ? { messages } : {}),
        confirmMode,
        thinkingMode,
        codingMode,
        codingExecutor,
        planBinding,
        messageMetadata,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      handlers.onError?.(
        errorData.code || 'HTTP_ERROR',
        errorData.message || `HTTP error: ${response.status}`,
      )
      return
    }

    if (!response.body) {
      handlers.onError?.('NO_BODY', 'Response body is empty')
      return
    }

    await consumeSSEStream(response.body.getReader(), handlers)
  }
  catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      return
    handlers.onError?.('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown error')
  }
  finally {
    abortControllers.delete(conversationId)
  }
}

export async function fetchConversationPlans(conversationId: string): Promise<ConversationPlansResponse | null> {
  try {
    return await apiClient.get<ConversationPlansResponse>(`/api/chat/plans/${conversationId}`)
  }
  catch {
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
    await apiClient.post('/api/chat/abort', { conversationId })
  }
  catch {
    // ignore
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
    const result = await apiClient.post<{ success: boolean }>('/api/chat/approve', {
      conversationId,
      toolCallId,
      approved,
      switchToYolo,
      addToWhitelist,
    })
    return result.success
  }
  catch {
    return false
  }
}

export async function answerQuestion(
  toolCallId: string,
  answers: QuestionAnswer[],
): Promise<boolean> {
  try {
    const result = await apiClient.post<{ success: boolean }>('/api/chat/answer', { toolCallId, answers })
    return result.success
  }
  catch {
    return false
  }
}
