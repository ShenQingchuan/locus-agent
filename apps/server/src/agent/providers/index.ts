import type { LLMProviderType } from '@locus-agent/shared'
import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createMoonshotAI } from '@ai-sdk/moonshotai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export type { LLMProviderType }

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
  openrouter: 'moonshotai/kimi-k2.5',
}

/**
 * Model context window sizes (in tokens)
 * Maps model ID to maximum context window size
 */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // OpenAI models
  'gpt-5.3': 200_000,
  'gpt-5': 200_000,
  'gpt-4': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-3.5-turbo': 16_385,
  // Anthropic models
  'claude-opus-4.6': 200_000,
  'claude-sonnet-4': 200_000,
  'claude-sonnet-4.5': 200_000,
  'claude-haiku-4.5': 200_000,
  'claude-opus': 200_000,
  'claude-sonnet': 200_000,
  'claude-haiku': 200_000,
  // Moonshot AI models
  'kimi-k2.5': 128_000,
  'moonshot-v1-8k': 8_192,
  'moonshot-v1-32k': 32_768,
  'moonshot-v1-128k': 128_000,
}

/**
 * Get context window size for a model
 * Returns default value if model not found in mapping
 */
export function getModelContextWindow(modelId: string): number {
  return MODEL_CONTEXT_WINDOWS[modelId.toLowerCase()] ?? 128_000
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
 * Get current model information including context window size
 */
export function getCurrentModelInfo(): {
  provider: LLMProviderType
  model: string
  contextWindow: number
} {
  const cfg = getConfig()
  const model = cfg.model || DEFAULT_MODELS[cfg.provider]
  return {
    provider: cfg.provider,
    model,
    contextWindow: getModelContextWindow(model),
  }
}

/**
 * SDK 内置默认地址与实际推荐地址不同的提供商，在此覆盖。
 * 例如 @ai-sdk/moonshotai 默认 api.moonshot.ai，但国内 key 需要 api.moonshot.cn。
 */
const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  moonshotai: 'https://api.moonshot.cn/v1',
}

/**
 * 根据配置创建对应的模型实例
 */
export function createLLMModel(modelId: string = getDefaultModel()): LanguageModel {
  const cfg = getConfig()
  const baseURL = cfg.apiBase || PROVIDER_DEFAULT_BASE_URLS[cfg.provider]

  switch (cfg.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return anthropic(modelId)
    }
    case 'moonshotai': {
      const moonshot = createMoonshotAI({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return moonshot(modelId)
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return openrouter(modelId)
    }
    case 'openai':
    default: {
      // 自定义 baseURL 时使用 openai-compatible，避免 OpenAI 专有的 Responses API 和 thinking 验证
      if (baseURL) {
        const provider = createOpenAICompatible({
          name: 'custom-openai',
          apiKey: cfg.apiKey,
          baseURL,
        })
        return provider.chatModel(modelId)
      }
      const openai = createOpenAI({ apiKey: cfg.apiKey })
      return openai(modelId)
    }
  }
}
