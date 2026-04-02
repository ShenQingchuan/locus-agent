import type { CodingExecutorType, CoreMessage, CustomProviderMode, LLMProviderType } from '@univedge/locus-agent-sdk'
import { DEFAULT_API_BASES, DEFAULT_MODELS, getCodingProviderForParent, isCodingModelProvider } from '@univedge/locus-agent-sdk'
import { useSessionStorage, useToggle } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { fetchSettingsConfig, updateSettingsConfig } from '@/api/settings'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'

export const useModelSettingsStore = defineStore('modelSettings', () => {
  // Think mode state
  const [thinkMode, toggleThinkMode] = useToggle(true)

  // Model provider & model name (synced with server settings)
  // sessionStorage so the last-used provider is restored immediately on mount
  // before the async server fetch completes, avoiding a flash of the default.
  const provider = useSessionStorage<LLMProviderType>('locus-agent:provider', 'anthropic')
  const modelName = ref('')
  const customMode = ref<CustomProviderMode>('openai-compatible')
  const isSavingModelSettings = ref(false)

  // Coding executor selection — sessionStorage so the ACP / model executor
  // choice survives page refreshes and tab switches within the same session.
  const codingExecutor = useSessionStorage<CodingExecutorType | null>('locus-agent:coding-executor', null)

  // Clear provider-affine coding executors when switching to a provider
  // that doesn't expose one. A2A executors are independent.
  watch(provider, (newProvider) => {
    if (codingExecutor.value && isCodingModelProvider(codingExecutor.value) && !getCodingProviderForParent(newProvider)) {
      codingExecutor.value = null
    }
  })

  // 模型上下文窗口配置（动态从 API 获取，默认：128K）
  const MAX_CONTEXT_TOKENS = ref(128_000)

  const MESSAGE_OVERHEAD_TOKENS = 6
  const TOOL_CALL_OVERHEAD_TOKENS = 20
  const TOOL_RESULT_OVERHEAD_TOKENS = 12

  const activeTokenizerModel = computed(() => {
    const selectedModel = (modelName.value || DEFAULT_MODELS[provider.value] || '').trim()
    return selectedModel || undefined
  })

  function estimateTextTokens(text: string): number {
    return countTextTokens(text, activeTokenizerModel.value)
  }

  function estimateUnknownTokens(value: unknown): number {
    return countUnknownTokens(value, activeTokenizerModel.value)
  }

  function estimateCoreMessageTokens(message: CoreMessage): number {
    switch (message.role) {
      case 'user':
      case 'system':
        return MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)
      case 'assistant': {
        let total = MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            total += TOOL_CALL_OVERHEAD_TOKENS
            total += estimateTextTokens(toolCall.toolCallId)
            total += estimateTextTokens(toolCall.toolName)
            total += estimateUnknownTokens(toolCall.args)
          }
        }
        return total
      }
      case 'tool': {
        let total = MESSAGE_OVERHEAD_TOKENS
        for (const toolResult of message.toolResults) {
          total += TOOL_RESULT_OVERHEAD_TOKENS
          total += estimateTextTokens(toolResult.toolCallId)
          total += estimateTextTokens(toolResult.toolName)
          total += estimateUnknownTokens(toolResult.result)
        }
        return total
      }
    }
  }

  async function loadModelSettings() {
    try {
      const config = await fetchSettingsConfig()
      if (config) {
        provider.value = config.provider
        modelName.value = config.model ?? ''
        customMode.value = config.customMode ?? 'openai-compatible'
        if (config.runtime?.contextWindow)
          MAX_CONTEXT_TOKENS.value = config.runtime.contextWindow
      }
    }
    catch (err) {
      console.warn('[modelSettings store] Failed to load model settings:', err)
    }
  }

  async function saveModelSettings(
    newProvider: LLMProviderType,
    newModel: string,
    newCustomMode?: CustomProviderMode,
  ): Promise<{ success: boolean, message?: string }> {
    if (isSavingModelSettings.value)
      return { success: false, message: '正在保存中' }
    isSavingModelSettings.value = true
    try {
      const providerChanged = newProvider !== provider.value
      const payload: Parameters<typeof updateSettingsConfig>[0] = {
        provider: newProvider,
        model: newModel,
      }

      if (providerChanged) {
        payload.apiBase = DEFAULT_API_BASES[newProvider] ?? ''
      }

      // 自定义提供商时保存兼容模式
      if (newProvider === 'custom' && newCustomMode) {
        payload.customMode = newCustomMode
      }

      const result = await updateSettingsConfig(payload)

      if (result.success) {
        provider.value = newProvider
        modelName.value = newModel
        if (newCustomMode)
          customMode.value = newCustomMode
        if (result.config?.customMode)
          customMode.value = result.config.customMode
        if (result.config?.runtime?.contextWindow)
          MAX_CONTEXT_TOKENS.value = result.config.runtime.contextWindow
        return { success: true }
      }
      return { success: false, message: result.message }
    }
    catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      return { success: false, message: msg }
    }
    finally {
      isSavingModelSettings.value = false
    }
  }

  return {
    thinkMode,
    toggleThinkMode,
    provider,
    modelName,
    customMode,
    isSavingModelSettings,
    codingExecutor,
    MAX_CONTEXT_TOKENS,
    activeTokenizerModel,
    estimateTextTokens,
    estimateUnknownTokens,
    estimateCoreMessageTokens,
    loadModelSettings,
    saveModelSettings,
  }
})
