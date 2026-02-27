<script setup lang="ts">
import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'
import { DEFAULT_API_BASES } from '@locus-agent/shared'
import { useToast } from '@locus-agent/ui'
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettingsConfig, updateSettingsConfig } from '@/api/chat'
import AppNavRail from '@/components/AppNavRail.vue'
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
const currentApiKeyMasked = ref<string | null>(null)
const apiKeysMasked = ref<Partial<Record<LLMProviderType, string | null>>>({})

const form = ref({
  provider: 'openai' as LLMProviderType,
  apiKey: '',
  apiBase: '',
  customMode: 'openai-compatible' as CustomProviderMode,
  port: 3000,
})

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

    form.value.provider = config.provider
    form.value.apiBase = config.apiBase || (config.provider === 'custom' ? '' : (DEFAULT_API_BASES[config.provider] || ''))
    form.value.customMode = config.customMode || 'openai-compatible'
    form.value.port = config.port

    apiKeysMasked.value = config.apiKeys ?? {}
    currentApiKeyMasked.value = apiKeysMasked.value[config.provider] ?? config.apiKeyMasked ?? null
    runtimeInfo.value = config.runtime ?? null
    requiresRestart.value = false
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
    const port = Number(form.value.port)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      toast.error('端口必须是 1-65535 之间的数字')
      return
    }

    const apiBase = form.value.apiBase.trim()

    // 自定义提供商验证
    if (form.value.provider === 'custom' && !apiBase) {
      toast.error('自定义提供商必须填写 API Base URL')
      return
    }

    const payload: {
      provider: LLMProviderType
      apiKey?: string
      apiBase: string
      customMode?: CustomProviderMode
      port: number
    } = {
      provider: form.value.provider,
      apiBase,
      port,
    }

    if (form.value.provider === 'custom') {
      payload.customMode = form.value.customMode
    }

    const trimmedKey = form.value.apiKey.trim()
    if (!trimmedKey && !currentApiKeyMasked.value) {
      toast.error('API Key 不能为空')
      return
    }
    if (trimmedKey)
      payload.apiKey = trimmedKey

    const result = await updateSettingsConfig(payload)
    if (!result.success) {
      toast.error(result.message || '保存失败')
      return
    }

    toast.success('设置已保存')
    requiresRestart.value = !!result.requiresRestart

    form.value.apiKey = ''
    if (result.config) {
      apiKeysMasked.value = result.config.apiKeys ?? apiKeysMasked.value
      currentApiKeyMasked.value = apiKeysMasked.value[form.value.provider] ?? result.config.apiKeyMasked ?? currentApiKeyMasked.value
      runtimeInfo.value = result.config.runtime ?? runtimeInfo.value
      // 同步 chatStore 以确保 ChatInput 显示一致的配置
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
        <!-- 响应式容器：移动端保持紧凑，桌面端扩展为宽屏布局 -->
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
            <!-- 布局策略：
                 - 桌面端：左右均衡两列
                 - 移动端：单列堆叠
            -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <!-- 左列 -->
              <div class="space-y-4 lg:space-y-6">
                <SettingsLLMCard
                  v-model:form="form"
                  v-model:current-api-key-masked="currentApiKeyMasked"
                  :runtime-info="runtimeInfo"
                  :requires-restart="requiresRestart"
                  :is-loading="isLoading"
                  :api-keys-masked="apiKeysMasked"
                  @submit="saveConfig"
                />
              </div>

              <!-- 右列 -->
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
