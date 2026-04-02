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

// Coding Executor exports
export type {
  ACPCodingProviderMeta,
  ACPCodingProviderType,
  CodingExecutorType,
  CodingModelProviderType,
  CodingProviderMeta,
} from './coding-executor.js'
export {
  ACP_CODING_PROVIDERS,
  CODING_MODEL_PROVIDERS,
  CODING_PROVIDERS,
  getCodingProviderForParent,
  isACPCodingProvider,
  isCodingExecutor,
  isCodingModelProvider,
} from './coding-executor.js'

// LLM Provider exports
export type {
  CustomProviderMode,
  LLMProviderMeta,
  LLMProviderType,
} from './llm-provider.js'
export {
  DEFAULT_API_BASES,
  DEFAULT_MODELS,
  LLM_PROVIDERS,
  normalizeModelForProvider,
} from './llm-provider.js'
