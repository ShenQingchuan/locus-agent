// Context management
export type * from './context/index.js'
export {
  CACHED_MARKER,
  COMPACTION_SYSTEM_PROMPT,
  compactToolResults,
  DEFAULT_COMPACTION_THRESHOLD,
  DEFAULT_HOT_TAIL_COUNT,
  DEFAULT_MIN_SIZE_TO_CACHE,
  DEFAULT_RECENT_TURNS_TO_KEEP,
  shouldCompact,
} from './context/index.js'
// Hook event model
export type * from './hooks/index.js'
export { HOOK_CATEGORIES, HookEvent, HookKind } from './hooks/index.js'

// Plugin contracts
export type * from './plugins/index.js'
export { hasPermission, PLUGIN_SCOPE_ORDER } from './plugins/index.js'

// Prompt builder
export type * from './prompt/index.js'
export { createPromptBuilder } from './prompt/index.js'

// Runtime contracts
export type * from './runtime/index.js'
export {
  BuiltinTool,
  classifyTool,
  ClaudeCodeTool,
} from './runtime/index.js'

// SSE protocol
export type * from './sse/index.js'
export {
  consumeSSEStream,
  createSSEEventPayload,
  dispatchSSEEvent,
  parseSSELine,
  serializeSSEEvent,
} from './sse/index.js'

export type * from './types/index.js'

export {
  ACP_CODING_PROVIDERS,
  CODING_MODEL_PROVIDERS,
  CODING_PROVIDERS,
  DEFAULT_API_BASES,
  DEFAULT_MODELS,
  getCodingProviderForParent,
  isACPCodingProvider,
  isCodingExecutor,
  isCodingModelProvider,
  LLM_PROVIDERS,
  normalizeModelForProvider,
} from './types/index.js'
export {
  DANGEROUS_COMMAND_PREFIXES,
  extractDefaultPattern,
  getCommandRiskLevel,
  getRiskLevel,
  MODERATE_COMMAND_PREFIXES,
  MULTI_WORD_COMMANDS,
  TOOL_DEFAULT_RISK,
} from './types/index.js'

// SDK Message helpers
export {
  extractAssistantText,
  extractResultText,
  extractToolUseBlocks,
  isAssistantMessage,
  isPartialMessage,
  isResultMessage,
  isSystemMessage,
  isToolResultMessage,
  toRuntimeUsage,
  toSDKUsage,
} from './types/index.js'
export { formatNotePreview, formatRelativeDateShort } from './utils/index.js'
