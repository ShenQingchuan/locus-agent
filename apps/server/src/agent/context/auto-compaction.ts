import type { LanguageModel, ModelMessage } from 'ai'
import { generateText } from 'ai'

/** 上下文使用率超过此比例时触发压缩 */
const COMPACTION_THRESHOLD = 0.80

/** 压缩时保留最近 N 轮对话（user+assistant 算一轮） */
const RECENT_TURNS_TO_KEEP = 4

const COMPACTION_SYSTEM_PROMPT = `You are a conversation compaction assistant.
Summarize the conversation into a structured "working state" document.
Output ONLY the summary in this exact format:

## Working State Summary

### Goal
[What the user is trying to accomplish]

### Completed Steps
- [Step 1 that was completed]
- [Step 2 that was completed]

### Current State
[What has been done so far, key file paths, important variable names/values, decisions made]

### Key Findings
- [Important discovery 1]
- [Important discovery 2]

### Next Steps
[What should happen next based on the conversation context]

Be concise but preserve all actionable information: file paths, function names, error messages, and technical details needed to continue the work.`

/**
 * 检查是否需要压缩
 */
export function shouldCompact(
  lastInputTokens: number,
  contextWindowSize: number,
): boolean {
  if (contextWindowSize <= 0 || lastInputTokens <= 0)
    return false
  return (lastInputTokens / contextWindowSize) >= COMPACTION_THRESHOLD
}

export interface CompactionResult {
  didCompact: boolean
  summaryText?: string
  messagesRemoved?: number
}

/**
 * 执行自动压缩：对旧消息做 LLM 摘要，保留近期对话。
 * 直接修改 messages 数组（in-place mutation）。
 */
export async function performCompaction(
  messages: ModelMessage[],
  model: LanguageModel,
): Promise<CompactionResult> {
  const keepCount = RECENT_TURNS_TO_KEEP * 2 // 粗略: 每轮 ~2 条 messages
  if (messages.length <= keepCount) {
    return { didCompact: false }
  }

  // 找到一个干净的分割点（user message 的开头）
  let splitIndex = messages.length - keepCount
  while (splitIndex > 0 && messages[splitIndex]?.role !== 'user') {
    splitIndex--
  }
  if (splitIndex <= 0) {
    return { didCompact: false }
  }

  const oldMessages = messages.slice(0, splitIndex)
  const recentMessages = messages.slice(splitIndex)

  // 构建要摘要的文本
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

    // 替换 messages 数组内容（in-place）
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
