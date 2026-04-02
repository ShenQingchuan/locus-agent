/**
 * Message Utilities
 *
 * Creation helpers, normalization, and content processing
 * for CoreMessage arrays. Browser and Node.js compatible.
 */

import type { AssistantMessage, CoreMessage, UserMessage } from '../types/message.js'

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createUserMessage(
  content: string,
  extras?: Pick<UserMessage, 'attachments'>,
): UserMessage {
  return { role: 'user', content, ...extras }
}

export function createAssistantMessage(content: string): AssistantMessage {
  return { role: 'assistant', content }
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/** Extract plain text from a CoreMessage (handles string content only). */
export function extractTextFromMessage(msg: CoreMessage): string {
  return typeof msg.content === 'string' ? msg.content : ''
}

/** Concatenate all assistant message texts in a conversation. */
export function extractAssistantTexts(messages: CoreMessage[]): string {
  return messages
    .filter(m => m.role === 'assistant')
    .map(m => extractTextFromMessage(m))
    .join('\n')
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Ensure the message array starts with a user message and alternates
 * user/assistant roles. Merges consecutive same-role messages.
 */
export function normalizeMessages(messages: CoreMessage[]): CoreMessage[] {
  const result: CoreMessage[] = []

  for (const msg of messages) {
    if (result.length > 0) {
      const last = result.at(-1)
      if (last?.role === msg.role && (msg.role === 'user' || msg.role === 'assistant')) {
        // Merge: append content with a newline
        result[result.length - 1] = {
          ...last,
          content: `${last.content}\n${msg.content}`,
        } as CoreMessage
        continue
      }
    }
    result.push({ ...msg })
  }

  return result
}

// ---------------------------------------------------------------------------
// Compaction helpers
// ---------------------------------------------------------------------------

/**
 * Create a compact-boundary placeholder message to inject after a summary.
 */
export function createCompactBoundaryMessage(): UserMessage {
  return {
    role: 'user',
    content: '[Previous context has been summarized above. Continuing conversation.]',
  }
}

/**
 * Truncate text to maxLength, placing an ellipsis in the middle.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength)
    return text
  const half = Math.floor(maxLength / 2)
  return `${text.slice(0, half)}\n...(truncated)...\n${text.slice(-half)}`
}

/**
 * Strip image attachments from all messages (for compaction / token saving).
 */
export function stripAttachments(messages: CoreMessage[]): CoreMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'user' || !msg.attachments?.length)
      return msg
    const { attachments: _, ...rest } = msg
    return rest as CoreMessage
  })
}
