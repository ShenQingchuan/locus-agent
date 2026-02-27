import type { LLMProviderType } from '@locus-agent/shared'
import type { LLMConfig } from './config-store.js'
import { getDefaultModelId, getProviderConfig, setProviderConfig } from './config-store.js'
import { createLLMModel } from './model-factory.js'
import { getModelContextWindow, triggerCatalogRefresh } from './openrouter-catalog.js'

export type { CustomProviderMode, LLMProviderType } from './config-store.js'
export type { LLMConfig }

export { createLLMModel, getModelContextWindow }

export function setLLMConfig(config: LLMConfig): void {
  setProviderConfig(config)
  triggerCatalogRefresh()
}

export function getDefaultModel(): string {
  return getDefaultModelId()
}

export function getCurrentModelInfo(): {
  provider: LLMProviderType
  model: string
  contextWindow: number
} {
  const cfg = getProviderConfig()
  const model = getDefaultModelId()
  return {
    provider: cfg.provider,
    model,
    contextWindow: getModelContextWindow(model),
  }
}
