import type { LLMProviderType } from '@univedge/locus-agent-sdk'
import type { CodingKimiConfig, ProviderConfigs } from '@/components/settings/SettingsLLMCard.vue'
import type { SettingsSectionId } from '@/constants/settings'
import { DEFAULT_API_BASES, DEFAULT_MODELS, LLM_PROVIDERS } from '@univedge/locus-agent-sdk'
import { useToast } from '@univedge/locus-ui'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSettingsConfig, updateKimiCodeSettings, updateSettingsConfig } from '@/api/settings'
import { SETTINGS_SECTIONS } from '@/constants/settings'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { initAllProviderConfigs } from '@/utils/settings'
import { useSettingsScrollSync } from './settings/useSettingsScrollSync'

export type { SettingsSectionId }

export function useSettingsView() {
  const router = useRouter()
  const route = useRoute()
  const toast = useToast()
  const modelSettings = useModelSettingsStore()

  const {
    contentScrollEl,
    activeSection,
    setSectionRef,
    cancelScrollSync,
    syncActiveSectionFromScroll,
    handleContentScroll,
    scrollToSection,
    navigateToSection,
    syncSectionFromHash,
    getSectionFromHash,
  } = useSettingsScrollSync()

  // ---------------------------------------------------------------------------
  // LLM config state (owned here because header save button + page loading)
  // ---------------------------------------------------------------------------

  const isLoading = ref(false)
  const isSaving = ref(false)
  const loadError = ref<string | null>(null)
  const requiresRestart = ref(false)
  const embeddingStatusRefreshToken = ref(0)

  const runtimeInfo = ref<{ provider: string, model: string, contextWindow: number } | null>(null)
  const apiKeysMasked = ref<Partial<Record<LLMProviderType, string | null>>>({})

  // Active provider (which one is currently selected for use)
  const activeProvider = ref<LLMProviderType>('openai')

  // Port configuration (separate from provider configs)
  const port = ref<number>(3000)

  // Provider-specific configurations
  const providerConfigs = reactive<ProviderConfigs>({})

  // ---------------------------------------------------------------------------
  // Coding provider state
  // ---------------------------------------------------------------------------

  const codingKimi = ref<CodingKimiConfig>({
    hasApiKey: false,
    apiKeyMasked: null,
    apiBase: 'https://api.kimi.com/coding/v1',
    model: 'kimi-k2.5',
    newApiKey: '',
  })

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onMounted(() => {
    loadConfig()
  })

  onBeforeUnmount(() => {
    cancelScrollSync()
  })

  watch(() => route.hash, async (hash) => {
    if (isLoading.value || loadError.value)
      return

    const target = getSectionFromHash(hash)
    if (!target)
      return

    await nextTick()
    scrollToSection(target)
  })

  watch([isLoading, loadError], async ([loading, error]) => {
    if (loading || error) {
      cancelScrollSync()
      return
    }

    await nextTick()
    syncActiveSectionFromScroll()
    await syncSectionFromHash('auto')
  })

  async function loadConfig() {
    isLoading.value = true
    loadError.value = null
    try {
      const config = await fetchSettingsConfig()
      if (!config) {
        loadError.value = '加载配置失败'
        return
      }

      activeProvider.value = config.provider
      port.value = config.port
      apiKeysMasked.value = config.apiKeys ?? {}

      initAllProviderConfigs(providerConfigs)

      for (const p of LLM_PROVIDERS) {
        const isActiveProvider = p.value === config.provider

        providerConfigs[p.value] = {
          apiKey: '',
          apiBase: isActiveProvider
            ? (config.apiBase || (p.value === 'custom' ? '' : (DEFAULT_API_BASES[p.value] || '')))
            : (p.value === 'custom' ? '' : (DEFAULT_API_BASES[p.value] || '')),
          customMode: isActiveProvider
            ? (config.customMode || 'openai-compatible')
            : 'openai-compatible',
          model: isActiveProvider
            ? (config.model || DEFAULT_MODELS[p.value] || '')
            : (DEFAULT_MODELS[p.value] || ''),
        }
      }

      runtimeInfo.value = config.runtime ?? null
      requiresRestart.value = false
      embeddingStatusRefreshToken.value++

      if (config.codingKimi) {
        codingKimi.value = {
          ...config.codingKimi,
          newApiKey: '',
        }
      }
    }
    catch (error) {
      loadError.value = error instanceof Error ? error.message : '加载配置失败'
    }
    finally {
      await nextTick()
      isLoading.value = false
    }
  }

  async function saveConfig() {
    if (isSaving.value)
      return

    isSaving.value = true
    try {
      const portNum = Number(port.value)
      if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
        toast.error('端口必须是 1-65535 之间的数字')
        return
      }

      const activeConfig = providerConfigs[activeProvider.value]
      if (!activeConfig) {
        toast.error('配置加载异常，请刷新重试')
        return
      }

      const apiBase = activeConfig.apiBase.trim()

      if (activeProvider.value === 'custom' && !apiBase) {
        toast.error('自定义提供商必须填写 API Base URL')
        return
      }

      const payload: {
        provider: LLMProviderType
        apiKey?: string
        apiBase: string
        model?: string
        customMode?: import('@univedge/locus-agent-sdk').CustomProviderMode
        port: number
      } = {
        provider: activeProvider.value,
        apiBase,
        port: portNum,
      }

      const activeModel = activeConfig.model.trim()
      if (activeModel && activeModel !== DEFAULT_MODELS[activeProvider.value])
        payload.model = activeModel

      if (activeProvider.value === 'custom')
        payload.customMode = activeConfig.customMode

      const trimmedKey = activeConfig.apiKey.trim()
      const existingKeyMasked = apiKeysMasked.value[activeProvider.value]
      if (!trimmedKey && !existingKeyMasked) {
        toast.error(`API Key 不能为空 (${LLM_PROVIDERS.find(p => p.value === activeProvider.value)?.label || activeProvider.value})`)
        return
      }
      if (trimmedKey)
        payload.apiKey = trimmedKey

      const result = await updateSettingsConfig(payload)
      if (!result.success) {
        toast.error(result.message || '保存失败')
        return
      }

      const otherProviders = LLM_PROVIDERS.filter(p => p.value !== activeProvider.value)
      for (const providerMeta of otherProviders) {
        const provider = providerMeta.value
        const config = providerConfigs[provider]
        if (!config)
          continue

        const keyTrimmed = config.apiKey.trim()
        if (keyTrimmed) {
          const otherPayload: {
            provider: LLMProviderType
            apiKey: string
            apiBase?: string
            model?: string
            customMode?: import('@univedge/locus-agent-sdk').CustomProviderMode
          } = {
            provider,
            apiKey: keyTrimmed,
          }

          const apiBaseTrimmed = config.apiBase.trim()
          if (apiBaseTrimmed && apiBaseTrimmed !== DEFAULT_API_BASES[provider])
            otherPayload.apiBase = apiBaseTrimmed
          else if (provider === 'custom' && apiBaseTrimmed)
            otherPayload.apiBase = apiBaseTrimmed

          const modelTrimmed = config.model.trim()
          if (modelTrimmed && modelTrimmed !== DEFAULT_MODELS[provider])
            otherPayload.model = modelTrimmed

          if (provider === 'custom')
            otherPayload.customMode = config.customMode

          await updateSettingsConfig(otherPayload)
        }
      }

      toast.success('设置已保存')
      requiresRestart.value = !!result.requiresRestart

      for (const p of LLM_PROVIDERS) {
        const config = providerConfigs[p.value]
        if (config)
          config.apiKey = ''
      }

      if (result.config) {
        apiKeysMasked.value = result.config.apiKeys ?? apiKeysMasked.value
        runtimeInfo.value = result.config.runtime ?? runtimeInfo.value
        modelSettings.provider = result.config.provider
        modelSettings.modelName = result.config.model ?? ''
        modelSettings.customMode = result.config.customMode ?? 'openai-compatible'
        if (result.config.runtime?.contextWindow)
          modelSettings.MAX_CONTEXT_TOKENS = result.config.runtime.contextWindow
      }
      embeddingStatusRefreshToken.value++
    }
    finally {
      isSaving.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Coding provider handlers
  // ---------------------------------------------------------------------------

  async function handleKimiCodeSave(payload: { apiKey?: string, apiBase?: string, model?: string }) {
    const result = await updateKimiCodeSettings(payload)
    if (!result.success) {
      toast.error(result.message || '保存 Kimi Code 配置失败')
      return
    }
    toast.success('Kimi Code 配置已保存')
    if (result.config?.codingKimi)
      codingKimi.value = { ...result.config.codingKimi, newApiKey: '' }
  }

  return {
    router,
    route,
    modelSettings,
    SETTINGS_SECTIONS,
    isLoading,
    isSaving,
    loadError,
    requiresRestart,
    embeddingStatusRefreshToken,
    runtimeInfo,
    apiKeysMasked,
    activeProvider,
    port,
    providerConfigs,
    contentScrollEl,
    activeSection,
    setSectionRef,
    handleContentScroll,
    navigateToSection,
    codingKimi,
    loadConfig,
    saveConfig,
    handleKimiCodeSave,
  }
}
