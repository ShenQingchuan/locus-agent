import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'
import { DEFAULT_MODELS } from '@locus-agent/shared'

export type { CustomProviderMode, LLMProviderType }

export interface LLMConfig {
  provider: LLMProviderType
  apiKey: string
  apiBase?: string
  model?: string
  customMode?: CustomProviderMode
}

let configState: LLMConfig | null = null

export function setProviderConfig(config: LLMConfig): void {
  configState = config
}

export function getProviderConfig(): LLMConfig {
  if (configState)
    return configState
  throw new Error('LLM config not initialized. Run `locus-agent config` to set up.')
}

export function getProviderConfigOrNull(): LLMConfig | null {
  return configState
}

export function getDefaultModelId(): string {
  const cfg = getProviderConfig()
  return cfg.model || DEFAULT_MODELS[cfg.provider]
}
