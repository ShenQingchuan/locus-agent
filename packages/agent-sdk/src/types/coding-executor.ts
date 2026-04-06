/**
 * Coding Executor Types and Configuration
 *
 * Defines ACP-based coding executors (Claude Code, Kimi CLI, Codex) for code generation.
 *
 * @module types/coding-executor
 */

import type { LLMProviderType } from './llm-provider.js'

export type ACPCodingProviderType = 'claude-code' | 'kimi-cli' | 'codex'
export type CodingExecutorType = ACPCodingProviderType

export interface ACPCodingProviderMeta {
  value: ACPCodingProviderType
  label: string
  transport: 'local-cli' | 'remote-http'
  icon?: string
}

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
  {
    value: 'codex',
    label: 'Codex',
    transport: 'local-cli',
    icon: 'i-simple-icons:openai',
  },
]

/**
 * Suggested default ACP coding agent for the active main LLM tab (e.g. Kimi CLI under Moonshot).
 */
export function getDefaultCodingExecutorForProvider(parent: LLMProviderType): ACPCodingProviderType | null {
  if (parent === 'moonshotai')
    return 'kimi-cli'
  return null
}

/**
 * Type guard for ACP coding providers.
 */
export function isACPCodingProvider(value: string): value is ACPCodingProviderType {
  return ACP_CODING_PROVIDERS.some(cp => cp.value === value)
}

/**
 * Type guard for any coding executor (ACP-only).
 */
export function isCodingExecutor(value: string): value is CodingExecutorType {
  return isACPCodingProvider(value)
}
