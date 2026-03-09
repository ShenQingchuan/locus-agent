import type { CustomProviderMode, LLMProviderType } from '@locus-agent/agent-sdk'
import { DEFAULT_MODELS, LLM_PROVIDERS, normalizeModelForProvider } from '@locus-agent/agent-sdk'
import { useToast } from '@locus-agent/ui'
import { useDebounceFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'

export function useModelSelector() {
  const chatStore = useChatStore()
  const toast = useToast()

  const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.value, label: p.label, icon: p.icon }))

  const isCustomProvider = computed(() => chatStore.provider === 'custom')

  const customModeOptions: Array<{ value: CustomProviderMode, label: string, icon: string }> = [
    { value: 'openai-compatible', label: 'OpenAI', icon: 'i-simple-icons:openai' },
    { value: 'anthropic-compatible', label: 'Anthropic', icon: 'i-simple-icons:anthropic' },
  ]

  const localModel = ref('')
  const customModelPerProvider = ref<Partial<Record<LLMProviderType, string>>>({})

  watch(() => chatStore.modelName, (v) => {
    const normalized = normalizeModelForProvider(v ?? '', chatStore.provider)
    localModel.value = normalized
    if (normalized) {
      customModelPerProvider.value[chatStore.provider] = normalized
    }
  }, { immediate: true })

  const modelPlaceholder = computed(() => {
    if (chatStore.provider !== 'deepseek')
      return DEFAULT_MODELS[chatStore.provider] ?? ''
    return chatStore.thinkMode ? 'deepseek-reasoner' : 'deepseek-chat'
  })

  const modelInputWidth = computed(() => {
    const text = localModel.value || modelPlaceholder.value
    return `${Math.max(3, text.length) + 1}ch`
  })

  const debouncedSaveModel = useDebounceFn(async () => {
    const result = await chatStore.saveModelSettings(
      chatStore.provider,
      localModel.value.trim(),
      isCustomProvider.value ? chatStore.customMode : undefined,
    )
    if (!result.success)
      toast.error(result.message || '保存模型设置失败')
  }, 800)

  async function handleProviderChange(value: string) {
    const p = value as LLMProviderType
    if (localModel.value.trim()) {
      customModelPerProvider.value[chatStore.provider] = localModel.value.trim()
    }
    const remembered = normalizeModelForProvider(customModelPerProvider.value[p] ?? '', p)
    localModel.value = remembered
    const result = await chatStore.saveModelSettings(
      p,
      remembered,
      p === 'custom' ? chatStore.customMode : undefined,
    )
    if (!result.success) {
      toast.error(result.message || '切换提供商失败')
    }
  }

  async function handleCustomModeChange(value: string) {
    const mode = value as CustomProviderMode
    const result = await chatStore.saveModelSettings(chatStore.provider, localModel.value.trim(), mode)
    if (!result.success) {
      toast.error(result.message || '切换兼容模式失败')
    }
  }

  function handleModelInput() {
    customModelPerProvider.value[chatStore.provider] = localModel.value.trim()
    debouncedSaveModel()
  }

  return {
    providerOptions,
    isCustomProvider,
    customModeOptions,
    localModel,
    modelPlaceholder,
    modelInputWidth,
    handleProviderChange,
    handleCustomModeChange,
    handleModelInput,
  }
}
