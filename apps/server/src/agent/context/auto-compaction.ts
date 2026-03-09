import type { CompactionResult } from '@locus-agent/agent-sdk'
import type { LanguageModel, ModelMessage } from 'ai'
import {
  COMPACTION_SYSTEM_PROMPT,
  DEFAULT_RECENT_TURNS_TO_KEEP,
  shouldCompact,
} from '@locus-agent/agent-sdk'
import { generateText } from 'ai'

export { shouldCompact }
export type { CompactionResult }

/**
 * 执行自动压缩：对旧消息做 LLM 摘要，保留近期对话。
 * 直接修改 messages 数组（in-place mutation）。
 */
export async function performCompaction(
  messages: ModelMessage[],
  model: LanguageModel,
): Promise<CompactionResult> {
  const keepCount = DEFAULT_RECENT_TURNS_TO_KEEP * 2
  if (messages.length <= keepCount) {
    return { didCompact: false }
  }

  let splitIndex = messages.length - keepCount
  while (splitIndex > 0 && messages[splitIndex]?.role !== 'user') {
    splitIndex--
  }
  if (splitIndex <= 0) {
    return { didCompact: false }
  }

  const oldMessages = messages.slice(0, splitIndex)
  const recentMessages = messages.slice(splitIndex)

  const conversationText = oldMessages.map(formatMessageForSummary).join('\n\n')

  try {
    const { text: summary } = await generateText({
      model,
      system: COMPACTION_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Summarize this conversation:\n\n${conversationText}`,
      }],
      maxOutputTokens: 2000,
    })

    const removedCount = oldMessages.length

    messages.length = 0
    messages.push(
      {
        role: 'user',
        content: `[Auto-compacted conversation summary]\n\n${summary}`,
      },
      {
        role: 'assistant',
        content: 'Understood. I have the working state loaded and will continue from where we left off.',
      },
      ...recentMessages,
    )

    return {
      didCompact: true,
      summaryText: summary,
      messagesRemoved: removedCount,
    }
  }
  catch (error) {
    console.error('[auto-compaction] Failed to summarize:', error)
    return { didCompact: false }
  }
}

function formatMessageForSummary(msg: ModelMessage): string {
  if (msg.role === 'user') {
    return `User: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`
  }
  if (msg.role === 'assistant') {
    if (typeof msg.content === 'string') {
      return `Assistant: ${msg.content}`
    }
    if (Array.isArray(msg.content)) {
      const textParts = (msg.content as any[])
        .filter(p => p.type === 'text')
        .map(p => p.text)
        .join('')
      const toolCalls = (msg.content as any[])
        .filter(p => p.type === 'tool-call')
        .map(p => `[called ${p.toolName}]`)
        .join(', ')
      return `Assistant: ${textParts}${toolCalls ? `\n${toolCalls}` : ''}`
    }
    return `Assistant: ${JSON.stringify(msg.content)}`
  }
  if (msg.role === 'tool') {
    const parts = Array.isArray(msg.content) ? msg.content : []
    const summaries = (parts as any[]).map((p) => {
      const value = p.output?.value ?? ''
      const truncated = typeof value === 'string' && value.length > 500
        ? `${value.slice(0, 500)}...[truncated]`
        : value
      return `Tool(${p.toolName}): ${truncated}`
    })
    return summaries.join('\n')
  }
  return `${msg.role}: ${JSON.stringify(msg.content)}`
}
