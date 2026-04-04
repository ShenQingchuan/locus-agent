import type { CustomProviderMode, LLMProviderType } from '@univedge/locus-agent-sdk'
import type { CodingKimiConfig, ProviderConfigs } from '@/components/settings/SettingsLLMCard.vue'
import { DEFAULT_API_BASES, DEFAULT_MODELS, LLM_PROVIDERS } from '@univedge/locus-agent-sdk'
import { useToast } from '@univedge/locus-ui'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSettingsConfig, updateKimiCodeSettings, updateSettingsConfig } from '@/api/settings'
import { useModelSettingsStore } from '@/stores/modelSettings'

export type SettingsSectionId = 'llm' | 'server' | 'whitelist' | 'embedding' | 'mcp'

const HASH_PREFIX_RE = /^#/

export function useSettingsView() {
  const SETTINGS_SECTIONS: Array<{
    id: SettingsSectionId
    label: string
    description: string
    icon: string
  }> = [
    { id: 'llm', label: 'LLM', description: '模型与 API 提供商', icon: 'i-carbon-machine-learning-model' },
    { id: 'server', label: '服务端', description: '端口与运行状态', icon: 'i-carbon-application-web' },
    { id: 'whitelist', label: '白名单', description: '路径访问控制', icon: 'i-carbon-document-security' },
    { id: 'embedding', label: 'Embedding', description: '语义检索与本地模型', icon: 'i-carbon-model-alt' },
    { id: 'mcp', label: 'MCP', description: '工具服务与集成', icon: 'i-carbon-connection-signal' },
  ]

  const router = useRouter()
  const route = useRoute()
  const toast = useToast()
  const modelSettings = useModelSettingsStore()

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
  // Settings layout state
  // ---------------------------------------------------------------------------

  const contentScrollEl = ref<HTMLElement | null>(null)
  const activeSection = ref<SettingsSectionId>('llm')

  const sectionRefs = new Map<SettingsSectionId, HTMLElement>()
  let scrollSyncRaf: number | null = null

  function isSectionId(value: string): value is SettingsSectionId {
    return SETTINGS_SECTIONS.some(section => section.id === value)
  }

  function getSectionFromHash(hash: string): SettingsSectionId | null {
    const value = hash.replace(HASH_PREFIX_RE, '')
    return isSectionId(value) ? value : null
  }

  function setSectionRef(id: SettingsSectionId, el: Element | null): void {
    if (el instanceof HTMLElement)
      sectionRefs.set(id, el)
    else
      sectionRefs.delete(id)
  }

  function cancelScrollSync(): void {
    if (scrollSyncRaf !== null) {
      cancelAnimationFrame(scrollSyncRaf)
      scrollSyncRaf = null
    }
  }

  function syncActiveSectionFromScroll(): void {
    const container = contentScrollEl.value
    if (!container || sectionRefs.size === 0)
      return

    const marker = container.scrollTop + 96
    let nextActive: SettingsSectionId = SETTINGS_SECTIONS[0]?.id ?? 'llm'

    for (const section of SETTINGS_SECTIONS) {
      const el = sectionRefs.get(section.id)
      if (!el)
        continue

      if (el.offsetTop <= marker)
        nextActive = section.id
      else
        break
    }

    activeSection.value = nextActive
  }

  function handleContentScroll(): void {
    cancelScrollSync()
    scrollSyncRaf = requestAnimationFrame(() => {
      syncActiveSectionFromScroll()
      scrollSyncRaf = null
    })
  }

  function scrollToSection(id: SettingsSectionId, behavior: ScrollBehavior = 'smooth'): void {
    const container = contentScrollEl.value
    const section = sectionRefs.get(id)
    if (!container || !section)
      return

    container.scrollTo({
      top: Math.max(0, section.offsetTop - 20),
      behavior,
    })
  // activeSection is updated only by syncActiveSectionFromScroll (single source of truth)
  }

  async function navigateToSection(id: SettingsSectionId): Promise<void> {
    if (route.hash !== `#${id}`)
      await router.replace({ name: 'SettingsView', hash: `#${id}` })

    await nextTick()
    scrollToSection(id)
  }

  async function syncSectionFromHash(behavior: ScrollBehavior = 'auto'): Promise<void> {
    const target = getSectionFromHash(route.hash) || 'llm'
    await nextTick()
    scrollToSection(target, behavior)
  }

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

  // Helper to initialize provider config
  function initProviderConfig(
    provider: LLMProviderType,
    _existingKeyMasked: string | null,
    apiBase?: string,
    customMode?: CustomProviderMode,
    model?: string,
  ): void {
    providerConfigs[provider] = {
      apiKey: '',
      apiBase: apiBase || (provider === 'custom' ? '' : (DEFAULT_API_BASES[provider] || '')),
      customMode: customMode || 'openai-compatible',
      model: model || DEFAULT_MODELS[provider] || '',
    }
  }

  // Initialize all provider configs
  function initAllProviderConfigs() {
    for (const p of LLM_PROVIDERS) {
      if (!providerConfigs[p.value])
        initProviderConfig(p.value, null)
    }
  }

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

      initAllProviderConfigs()

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
        customMode?: CustomProviderMode
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
            customMode?: CustomProviderMode
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
