import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export type LLMProviderType = 'openai' | 'anthropic'

const providerType = (Bun.env.LLM_PROVIDER || 'openai') as LLMProviderType

const apiKey = Bun.env.LLM_API_KEY
if (!apiKey) {
  throw new Error('LLM_API_KEY environment variable is required')
}

const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
}

export const DEFAULT_MODEL = Bun.env.LLM_MODEL || DEFAULT_MODELS[providerType]

/**
 * 根据 LLM_PROVIDER 创建对应的模型实例
 */
export function createLLMModel(modelId: string = DEFAULT_MODEL): LanguageModel {
  switch (providerType) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        ...(Bun.env.LLM_API_BASE ? { baseURL: Bun.env.LLM_API_BASE } : {}),
      })
      return anthropic(modelId)
    }
    case 'openai':
    default: {
      // 自定义 baseURL 时使用 openai-compatible，避免 OpenAI 专有的 Responses API 和 thinking 验证
      if (Bun.env.LLM_API_BASE) {
        const provider = createOpenAICompatible({
          name: 'custom-openai',
          apiKey,
          baseURL: Bun.env.LLM_API_BASE,
        })
        return provider.chatModel(modelId)
      }
      const openai = createOpenAI({ apiKey })
      return openai(modelId)
    }
  }
}
