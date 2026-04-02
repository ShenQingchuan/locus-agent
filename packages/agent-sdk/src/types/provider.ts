/**
 * Provider Types - Backward Compatibility Re-exports
 *
 * This module re-exports from the split llm-provider and coding-executor modules
 * for backward compatibility. New code should import directly from the specific modules:
 *
 * - For LLM providers: `import { LLMProviderType, ... } from './llm-provider.js'`
 * - For coding executors: `import { CodingExecutorType, ... } from './coding-executor.js'`
 *
 * @deprecated Import from llm-provider.js or coding-executor.js directly
 * @module types/provider
 */

// LLM Provider exports
export type { LLMProviderType, CustomProviderMode, LLMProviderMeta } from './llm-provider.js'
export {
  LLM_PROVIDERS,
  DEFAULT_MODELS,
  DEFAULT_API_BASES,
  normalizeModelForProvider,
} from './llm-provider.js'

// Coding Executor exports
export type {
  CodingModelProviderType,
  ACPCodingProviderType,
  CodingExecutorType,
  CodingProviderMeta,
  ACPCodingProviderMeta,
} from './coding-executor.js'
export {
  CODING_MODEL_PROVIDERS,
  ACP_CODING_PROVIDERS,
  CODING_PROVIDERS,
  getCodingProviderForParent,
  isCodingModelProvider,
  isACPCodingProvider,
  isCodingExecutor,
} from './coding-executor.js'

