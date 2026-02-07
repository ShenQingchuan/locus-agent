import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createMoonshotAI } from '@ai-sdk/moonshotai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export type LLMProviderType = 'openai' | 'anthropic' | 'moonshotai'

export interface LLMConfig {
  provider: LLMProviderType
  apiKey: string
  apiBase?: string
  model?: string
}

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: 'gpt-5.3',
  anthropic: 'claude-opus-4.6',
  moonshotai: 'kimi-k2.5',
}

let _config: LLMConfig | null = null

/**
 * Inject LLM config (called at startup by both CLI and dev mode)
 */
export function setLLMConfig(config: LLMConfig): void {
  _config = config
}

function getConfig(): LLMConfig {
  if (_config)
    return _config
  throw new Error('LLM config not initialized. Run `locus-agent config` to set up.')
}

export function getDefaultModel(): string {
  const cfg = getConfig()
  return cfg.model || DEFAULT_MODELS[cfg.provider]
}

/**
 * 根据配置创建对应的模型实例
 */
export function createLLMModel(modelId: string = getDefaultModel()): LanguageModel {
  const cfg = getConfig()

  switch (cfg.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        ...(cfg.apiBase ? { baseURL: cfg.apiBase } : {}),
      })
      return anthropic(modelId)
    }
    case 'moonshotai': {
      const moonshot = createMoonshotAI({
        apiKey: cfg.apiKey,
        ...(cfg.apiBase ? { baseURL: cfg.apiBase } : {}),
      })
      return moonshot(modelId)
    }
    case 'openai':
    default: {
      // 自定义 baseURL 时使用 openai-compatible，避免 OpenAI 专有的 Responses API 和 thinking 验证
      if (cfg.apiBase) {
        const provider = createOpenAICompatible({
          name: 'custom-openai',
          apiKey: cfg.apiKey,
          baseURL: cfg.apiBase,
        })
        return provider.chatModel(modelId)
      }
      const openai = createOpenAI({ apiKey: cfg.apiKey })
      return openai(modelId)
    }
  }
}
