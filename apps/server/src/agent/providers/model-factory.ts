import type { LanguageModel } from 'ai'
import type { LLMProviderType } from './config-store.js'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createMoonshotAI } from '@ai-sdk/moonshotai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { normalizeModelForProvider } from '@locus-agent/shared'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { getDefaultModelId, getProviderConfig } from './config-store.js'

const PROVIDER_DEFAULT_BASE_URLS: Partial<Record<LLMProviderType, string>> = {
  moonshotai: 'https://api.moonshot.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

export function createLLMModel(
  modelId: string = getDefaultModelId(),
  thinkingMode?: boolean,
): LanguageModel {
  const cfg = getProviderConfig()
  const baseURL = cfg.apiBase || PROVIDER_DEFAULT_BASE_URLS[cfg.provider]
  let effectiveModelId = normalizeModelForProvider(modelId, cfg.provider)

  switch (cfg.provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return anthropic(effectiveModelId)
    }
    case 'deepseek': {
      if (thinkingMode !== undefined) {
        const isReasoner = effectiveModelId.includes('reasoner')
        effectiveModelId = thinkingMode && !isReasoner
          ? 'deepseek-reasoner'
          : !thinkingMode && isReasoner
              ? 'deepseek-chat'
              : effectiveModelId
      }
      const deepseek = createDeepSeek({
        apiKey: cfg.apiKey,
        baseURL: baseURL || 'https://api.deepseek.com',
      })
      return deepseek.chat(effectiveModelId)
    }
    case 'moonshotai': {
      const moonshot = createMoonshotAI({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return moonshot(effectiveModelId)
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: cfg.apiKey,
        ...(baseURL ? { baseURL } : {}),
      })
      return openrouter(effectiveModelId)
    }
    case 'custom': {
      const mode = cfg.customMode || 'openai-compatible'
      if (!baseURL) {
        throw new Error('自定义提供商必须配置 API Base URL')
      }
      if (mode === 'anthropic-compatible') {
        const anthropic = createAnthropic({
          apiKey: cfg.apiKey,
          baseURL,
        })
        return anthropic(effectiveModelId)
      }
      else {
        const provider = createOpenAICompatible({
          name: 'custom-provider',
          apiKey: cfg.apiKey,
          baseURL,
        })
        return provider.chatModel(effectiveModelId)
      }
    }
    case 'openai':
    default: {
      if (baseURL) {
        const provider = createOpenAICompatible({
          name: 'custom-openai',
          apiKey: cfg.apiKey,
          baseURL,
        })
        return provider.chatModel(effectiveModelId)
      }
      const openai = createOpenAI({ apiKey: cfg.apiKey })
      return openai(effectiveModelId)
    }
  }
}
