<script setup lang="ts">
import type { CustomProviderMode, LLMProviderType } from '@locus-agent/agent-sdk'
import type { CodingKimiConfig, ProviderConfigs } from '@/components/settings/SettingsLLMCard.vue'
import { DEFAULT_API_BASES, DEFAULT_MODELS, LLM_PROVIDERS } from '@locus-agent/agent-sdk'
import { useToast } from '@locus-agent/ui'
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettingsConfig, updateKimiCodeSettings, updateSettingsConfig } from '@/api/settings'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import SettingsEmbeddingCard from '@/components/settings/SettingsEmbeddingCard.vue'
import SettingsLLMCard from '@/components/settings/SettingsLLMCard.vue'
import SettingsMCPCard from '@/components/settings/SettingsMCPCard.vue'
import SettingsWhitelistCard from '@/components/settings/SettingsWhitelistCard.vue'
import { useChatStore } from '@/stores/chat'

const router = useRouter()
const toast = useToast()
const chatStore = useChatStore()

// ---------------------------------------------------------------------------
// LLM config state (owned here because header save button + page loading)
// ---------------------------------------------------------------------------

const isLoading = ref(false)
const isSaving = ref(false)
const loadError = ref<string | null>(null)
const requiresRestart = ref(false)

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
    if (!providerConfigs[p.value]) {
      initProviderConfig(p.value, null)
    }
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  loadConfig()
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

    // Set active provider and port
    activeProvider.value = config.provider
    port.value = config.port

    // Store masked API keys for all providers
    apiKeysMasked.value = config.apiKeys ?? {}

    // Initialize all provider configs
    initAllProviderConfigs()

    // Load config for each provider from the response
    for (const p of LLM_PROVIDERS) {
      const isActiveProvider = p.value === config.provider

      // For the active provider, use the saved apiBase, customMode and model
      // For others, they may not have specific settings yet
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

    // Coding providers
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
    // Validate port
    const portNum = Number(port.value)
    if (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535) {
      toast.error('端口必须是 1-65535 之间的数字')
      return
    }

    // Get current active provider's config
    const activeConfig = providerConfigs[activeProvider.value]
    if (!activeConfig) {
      toast.error('配置加载异常，请刷新重试')
      return
    }

    const apiBase = activeConfig.apiBase.trim()

    // Validate custom provider
    if (activeProvider.value === 'custom' && !apiBase) {
      toast.error('自定义提供商必须填写 API Base URL')
      return
    }

    // Build payload for active provider
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

    // Add model if specified (not empty and not default)
    const activeModel = activeConfig.model.trim()
    if (activeModel && activeModel !== DEFAULT_MODELS[activeProvider.value]) {
      payload.model = activeModel
    }

    if (activeProvider.value === 'custom') {
      payload.customMode = activeConfig.customMode
    }

    const trimmedKey = activeConfig.apiKey.trim()
    const existingKeyMasked = apiKeysMasked.value[activeProvider.value]
    if (!trimmedKey && !existingKeyMasked) {
      toast.error(`API Key 不能为空 (${LLM_PROVIDERS.find(p => p.value === activeProvider.value)?.label || activeProvider.value})`)
      return
    }
    if (trimmedKey)
      payload.apiKey = trimmedKey

    // First save: active provider config
    const result = await updateSettingsConfig(payload)
    if (!result.success) {
      toast.error(result.message || '保存失败')
      return
    }

    // Save API keys for other providers that have been modified
    const otherProviders = LLM_PROVIDERS.filter(p => p.value !== activeProvider.value)
    for (const providerMeta of otherProviders) {
      const provider = providerMeta.value
      const config = providerConfigs[provider]
      if (!config)
        continue

      const keyTrimmed = config.apiKey.trim()
      // Only save if there's a new API key entered
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

        // Only include apiBase if it's different from default or explicitly set
        const apiBaseTrimmed = config.apiBase.trim()
        if (apiBaseTrimmed && apiBaseTrimmed !== DEFAULT_API_BASES[provider]) {
          otherPayload.apiBase = apiBaseTrimmed
        }
        else if (provider === 'custom' && apiBaseTrimmed) {
          otherPayload.apiBase = apiBaseTrimmed
        }

        // Only include model if it's different from default
        const modelTrimmed = config.model.trim()
        if (modelTrimmed && modelTrimmed !== DEFAULT_MODELS[provider]) {
          otherPayload.model = modelTrimmed
        }

        if (provider === 'custom') {
          otherPayload.customMode = config.customMode
        }

        // Save this provider's config (don't show toast for each)
        await updateSettingsConfig(otherPayload)
      }
    }

    toast.success('设置已保存')
    requiresRestart.value = !!result.requiresRestart

    // Reset API key fields and refresh config
    for (const p of LLM_PROVIDERS) {
      const config = providerConfigs[p.value]
      if (config) {
        config.apiKey = ''
      }
    }

    if (result.config) {
      apiKeysMasked.value = result.config.apiKeys ?? apiKeysMasked.value
      runtimeInfo.value = result.config.runtime ?? runtimeInfo.value
      // Sync chatStore to ensure ChatInput shows consistent config
      chatStore.provider = result.config.provider
      chatStore.modelName = result.config.model ?? ''
      chatStore.customMode = result.config.customMode ?? 'openai-compatible'
      if (result.config.runtime?.contextWindow)
        chatStore.MAX_CONTEXT_TOKENS = result.config.runtime.contextWindow
    }
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
  if (result.config?.codingKimi) {
    codingKimi.value = { ...result.config.codingKimi, newApiKey: '' }
  }
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 flex flex-col min-w-0">
      <header class="flex-shrink-0 border-b border-border bg-background px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            class="btn-ghost btn-icon"
            title="返回"
            @click="router.push({ name: 'chat' })"
          >
            <div class="i-carbon-arrow-left h-4 w-4" />
          </button>
          <h1 class="text-sm font-medium text-foreground">
            设置
          </h1>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="btn-primary btn-xs !px-4"
            :disabled="isLoading || isSaving || !!loadError"
            @click="saveConfig"
          >
            <span v-if="isSaving" class="i-carbon-circle-dash text-sm animate-spin mr-1.5" />
            保存
          </button>
          <button
            class="btn-ghost btn-icon"
            title="刷新"
            :disabled="isLoading || isSaving"
            @click="loadConfig"
          >
            <div class="i-carbon-renew h-4 w-4" />
          </button>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto">
        <!-- Responsive container -->
        <div class="container-chat lg:max-w-5xl xl:max-w-6xl p-4 lg:p-6">
          <div
            v-if="isLoading"
            class="flex-col-center py-12 text-muted-foreground"
          >
            <div class="i-carbon-circle-dash h-6 w-6 animate-spin opacity-50" />
            <span class="text-xs mt-2 opacity-70">加载中...</span>
          </div>

          <div
            v-else-if="loadError"
            class="alert alert-destructive"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="text-sm">
                {{ loadError }}
              </div>
              <button class="btn-outline btn-sm" @click="loadConfig">
                重试
              </button>
            </div>
          </div>

          <template v-else>
            <!-- Layout: desktop 2-column, mobile 1-column -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <!-- Left column -->
              <div class="space-y-4 lg:space-y-6">
                <SettingsLLMCard
                  v-model:provider-configs="providerConfigs"
                  v-model:port="port"
                  v-model:active-provider="activeProvider"
                  :runtime-info="runtimeInfo"
                  :requires-restart="requiresRestart"
                  :is-loading="isLoading"
                  :api-keys-masked="apiKeysMasked"
                  :coding-kimi="codingKimi"
                  @submit="saveConfig"
                  @kimi-code-save="handleKimiCodeSave"
                />
              </div>

              <!-- Right column -->
              <div class="space-y-4 lg:space-y-6">
                <SettingsWhitelistCard />
                <SettingsEmbeddingCard />
                <SettingsMCPCard />
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>
