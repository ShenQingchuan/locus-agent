import { ACP_CODING_PROVIDERS, getCodingProviderForParent, isACPCodingProvider } from '@univedge/locus-agent-sdk'
import { computed } from 'vue'
import { useModelSelector } from '@/composables/useModelSelector'
import { useModelSettingsStore } from '@/stores/modelSettings'

export function useChatInputModel(
  showCodingMode: boolean | undefined,
) {
  const modelSettings = useModelSettingsStore()

  const {
    providerOptions,
    isCustomProvider,
    customModeOptions,
    localModel,
    modelPlaceholder,
    modelInputWidth,
    handleProviderChange,
    handleCustomModeChange,
    handleModelInput,
  } = useModelSelector()

  const activeACPExecutor = computed(() =>
    modelSettings.codingExecutor && isACPCodingProvider(modelSettings.codingExecutor)
      ? ACP_CODING_PROVIDERS.find(p => p.value === modelSettings.codingExecutor)
      : undefined,
  )

  const codingExecutorSelectValue = computed(() => {
    if (showCodingMode && activeACPExecutor.value)
      return `acp:${activeACPExecutor.value.value}`
    return modelSettings.provider
  })

  const codingProviderOptions = computed(() => {
    if (!showCodingMode)
      return providerOptions

    return [
      ...providerOptions.map((option, index) => ({
        ...option,
        groupLabel: index === 0 ? '模型提供商' : undefined,
      })),
      ...ACP_CODING_PROVIDERS.map((provider, index) => ({
        value: `acp:${provider.value}`,
        label: provider.label,
        icon: provider.icon,
        separator: index === 0,
        groupLabel: index === 0 ? 'ACP' : undefined,
      })),
    ]
  })

  async function handleCodingExecutorSelect(value: string) {
    if (!showCodingMode || !value.startsWith('acp:')) {
      modelSettings.codingExecutor = getCodingProviderForParent(modelSettings.provider)?.value ?? null
      await handleProviderChange(value)
      return
    }

    const provider = value.replace('acp:', '')
    modelSettings.codingExecutor = provider as typeof modelSettings.codingExecutor
  }

  return {
    isCustomProvider,
    customModeOptions,
    localModel,
    modelPlaceholder,
    modelInputWidth,
    handleProviderChange,
    handleCustomModeChange,
    handleModelInput,
    activeACPExecutor,
    codingExecutorSelectValue,
    codingProviderOptions,
    handleCodingExecutorSelect,
  }
}
