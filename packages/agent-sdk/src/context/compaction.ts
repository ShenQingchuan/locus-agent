/**
 * Default threshold: compact when input tokens reach 65% of context window.
 */
export const DEFAULT_COMPACTION_THRESHOLD = 0.65

/**
 * Default: keep 4 recent conversation turns (user+assistant pairs).
 */
export const DEFAULT_RECENT_TURNS_TO_KEEP = 4

export const COMPACTION_SYSTEM_PROMPT = `You are a conversation compaction assistant.
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

export interface CompactionResult {
  didCompact: boolean
  summaryText?: string
  messagesRemoved?: number
}

/**
 * Abstraction for the summarization step, allowing different backends
 * (e.g. LLM via Vercel AI SDK, local model, mock for tests).
 */
export interface MessageSummarizer {
  summarize: (conversationText: string) => Promise<string>
}

/**
 * Strategy interface for context compaction.
 */
export interface CompactionStrategy<TMessage = unknown> {
  shouldCompact: (inputTokens: number, contextWindow: number) => boolean
  compact: (messages: TMessage[], summarizer: MessageSummarizer) => Promise<CompactionResult>
}

/**
 * Default threshold-based compaction check.
 */
export function shouldCompact(
  lastInputTokens: number,
  contextWindowSize: number,
  threshold: number = DEFAULT_COMPACTION_THRESHOLD,
): boolean {
  if (contextWindowSize <= 0 || lastInputTokens <= 0)
    return false
  return (lastInputTokens / contextWindowSize) >= threshold
}
