import type { CoreMessage, MessageImageAttachment, MessageMetadata, PlanBinding } from '@univedge/locus-agent-sdk'
import type { Message } from '@/composables/useAssistantRuntime'
import type { ConversationScope } from '@/composables/useConversationScopeState'
import { streamChat } from '@/api/chat'

interface StreamAssistantReplyOptions {
  conversationId: string
  assistantMessageId: string
  message: string
  attachments?: MessageImageAttachment[]
  messages?: CoreMessage[]
  scope: ConversationScope
  confirmMode: boolean
  thinkingMode: boolean
  codingMode?: 'build' | 'plan'
  codingProvider?: 'kimi-code'
  planBinding?: PlanBinding
  messageMetadata?: MessageMetadata
  onReasoningDelta: (delta: string) => void
  onTextDelta: (delta: string) => void
  onToolCallStart: (toolCall: Parameters<NonNullable<Parameters<typeof streamChat>[0]['onToolCallStart']>>[0]) => void
  onToolCallResult: (toolResult: Parameters<NonNullable<Parameters<typeof streamChat>[0]['onToolCallResult']>>[0]) => void
  onToolPendingApproval: (approval: Parameters<NonNullable<Parameters<typeof streamChat>[0]['onToolPendingApproval']>>[0]) => void
  onQuestionPending: (question: Parameters<NonNullable<Parameters<typeof streamChat>[0]['onQuestionPending']>>[0]) => void
  onToolOutputDelta: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void
  onDelegateDelta: (event: Parameters<NonNullable<Parameters<typeof streamChat>[0]['onDelegateDelta']>>[0]) => void
  onDone: (usage?: Message['usage'], model?: string) => void
  onError: (code: string, message: string) => void
  isStillStreaming: () => boolean
  onMissingTerminalEvent: () => void
}

export async function streamAssistantReply(options: StreamAssistantReplyOptions): Promise<void> {
  try {
    await streamChat({
      conversationId: options.conversationId,
      space: options.scope.space,
      projectKey: options.scope.projectKey,
      workspaceRoot: options.scope.workspaceRoot,
      message: options.message,
      attachments: options.attachments,
      messages: options.messages,
      confirmMode: options.confirmMode,
      thinkingMode: options.thinkingMode,
      codingMode: options.codingMode,
      codingProvider: options.codingProvider,
      planBinding: options.planBinding,
      messageMetadata: options.messageMetadata,
      onReasoningDelta: options.onReasoningDelta,
      onTextDelta: options.onTextDelta,
      onToolCallStart: (toolCall) => {
        options.onToolCallStart(toolCall)
      },
      onToolCallResult: (toolResult) => {
        options.onToolCallResult(toolResult)
      },
      onToolPendingApproval: (approval) => {
        options.onToolPendingApproval(approval)
      },
      onQuestionPending: (question) => {
        options.onQuestionPending(question)
      },
      onToolOutputDelta: (toolCallId, stream, delta) => {
        options.onToolOutputDelta(toolCallId, stream, delta)
      },
      onDelegateDelta: (event) => {
        options.onDelegateDelta(event)
      },
      onDone: (_messageId, usage, model) => {
        options.onDone(usage, model)
      },
      onError: (code, message) => {
        options.onError(code, message)
      },
    })

    if (options.isStillStreaming()) {
      options.onMissingTerminalEvent()
    }
  }
  catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    options.onError('STREAM_ERROR', errorMessage)
  }
}
