export type {
  CompactionResult,
  CompactionStrategy,
  MessageSummarizer,
} from './compaction.js'
export {
  COMPACTION_SYSTEM_PROMPT,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_RECENT_TURNS_TO_KEEP,
  shouldCompact,
} from './compaction.js'

export type {
  CacheEntry,
  ResultCacheStorage,
  ToolResultCacheOptions,
} from './tool-result-cache.js'
export {
  CACHED_MARKER,
  compactToolResults,
  DEFAULT_HOT_TAIL_COUNT,
  DEFAULT_MIN_SIZE_TO_CACHE,
} from './tool-result-cache.js'
