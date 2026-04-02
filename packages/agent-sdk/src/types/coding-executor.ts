/**
 * Coding Executor Types and Configuration
 *
 * Defines available coding executors (Kimi Code, Claude Code) for code generation.
 * Use these types for selecting code generation providers separate from main LLM.
 *
 * @module types/coding-executor
 */

import type { LLMProviderType } from './llm-provider.js'

export type CodingModelProviderType = 'kimi-code'
export type ACPCodingProviderType = 'claude-code' | 'kimi-cli'
export type CodingExecutorType = CodingModelProviderType | ACPCodingProviderType

export interface CodingProviderMeta {
  value: CodingModelProviderType
  label: string
  /** Which main LLM provider tab this coding provider lives under */
  parentProvider: LLMProviderType
  defaultModel: string
  defaultApiBase: string
  /** 'api-key' = normal key input */
  authMode: 'api-key'
  /** SDK format used for API calls */
  apiFormat: 'anthropic'
}

export interface ACPCodingProviderMeta {
  value: ACPCodingProviderType
  label: string
  transport: 'local-cli' | 'remote-http'
  icon?: string
}

export const CODING_MODEL_PROVIDERS: CodingProviderMeta[] = [
  {
    value: 'kimi-code',
    label: 'Kimi Code',
    parentProvider: 'moonshotai',
    defaultModel: 'kimi-k2.5',
    defaultApiBase: 'https://api.kimi.com/coding/v1',
    authMode: 'api-key',
    apiFormat: 'anthropic',
  },
]

export const ACP_CODING_PROVIDERS: ACPCodingProviderMeta[] = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    transport: 'local-cli',
    icon: 'i-simple-icons:claude',
  },
  {
    value: 'kimi-cli',
    label: 'Kimi CLI',
    transport: 'local-cli',
    icon: 'i-custom:moonshot',
  },
]

export const CODING_PROVIDERS = CODING_MODEL_PROVIDERS

/**
 * Look up which coding provider belongs to a given main provider tab.
 */
export function getCodingProviderForParent(parent: LLMProviderType): CodingProviderMeta | undefined {
  return CODING_MODEL_PROVIDERS.find(cp => cp.parentProvider === parent)
}

/**
 * Type guard for coding model providers.
 */
export function isCodingModelProvider(value: string): value is CodingModelProviderType {
  return CODING_MODEL_PROVIDERS.some(cp => cp.value === value)
}

/**
 * Type guard for ACP coding providers.
 */
export function isACPCodingProvider(value: string): value is ACPCodingProviderType {
  return ACP_CODING_PROVIDERS.some(cp => cp.value === value)
}

/**
 * Type guard for any coding executor (both model and ACP).
 */
export function isCodingExecutor(value: string): value is CodingExecutorType {
  return isCodingModelProvider(value) || isACPCodingProvider(value)
}
