/** Minimum character count before a tool result is eligible for caching. */
export const DEFAULT_MIN_SIZE_TO_CACHE = 800

/** Number of recent tool messages kept fully inline (hot tail). */
export const DEFAULT_HOT_TAIL_COUNT = 2

/** Prefix marker for already-cached results. */
export const CACHED_MARKER = '[CACHED:'

export interface CacheEntry {
  toolCallId: string
  toolName: string
  cachePath: string
}

/**
 * Pluggable storage backend for tool result caching.
 * The server provides a file-system implementation; tests can use in-memory.
 */
export interface ResultCacheStorage {
  write: (key: string, content: string) => void
  read: (key: string) => string | null
}

export interface ToolResultCacheOptions {
  hotTailCount?: number
  minSizeToCache?: number
  storage: ResultCacheStorage
}

/**
 * Generic message shape expected by compactToolResults.
 * Intentionally loose so it works with both SDK AgentMessage and Vercel AI
 * SDK ModelMessage without import coupling.
 */
interface ToolResultPart {
  type: string
  toolCallId?: string
  toolName?: string
  output?: { value?: string }
}

interface GenericMessage {
  role: string
  content?: unknown
}

/**
 * Cold/hot split for tool results in a messages array.
 *
 * - Hot tail (most recent `hotTailCount` tool messages) stay fully inline.
 * - Older tool results exceeding `minSizeToCache` chars are persisted via
 *   the provided storage and replaced with a compact reference + preview.
 *
 * Mutates the messages array in-place.
 */
export function compactToolResults(
  messages: GenericMessage[],
  options: ToolResultCacheOptions,
): CacheEntry[] {
  const hotTailCount = options.hotTailCount ?? DEFAULT_HOT_TAIL_COUNT
  const minSizeToCache = options.minSizeToCache ?? DEFAULT_MIN_SIZE_TO_CACHE

  const toolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]!.role === 'tool') {
      toolIndices.push(i)
    }
  }

  const coldCount = Math.max(0, toolIndices.length - hotTailCount)
  if (coldCount === 0)
    return []

  const coldIndices = toolIndices.slice(0, coldCount)
  const entries: CacheEntry[] = []

  for (const idx of coldIndices) {
    const msg = messages[idx]!
    const content = msg.content
    if (!content || !Array.isArray(content))
      continue

    for (const part of content as ToolResultPart[]) {
      if (part.type !== 'tool-result')
        continue

      const value = part.output?.value
      if (!value || typeof value !== 'string')
        continue
      if (value.length <= minSizeToCache)
        continue
      if (value.startsWith(CACHED_MARKER))
        continue

      const key = `${part.toolCallId}.txt`
      options.storage.write(key, value)

      const preview = value.slice(0, 200).replace(/\n/g, ' ')
      part.output!.value = `${CACHED_MARKER} ${key}]\nPreview: ${preview}...\n(Full output: ${value.length} chars, cached to disk)`

      entries.push({
        toolCallId: part.toolCallId ?? '',
        toolName: part.toolName ?? '',
        cachePath: key,
      })
    }
  }

  return entries
}
