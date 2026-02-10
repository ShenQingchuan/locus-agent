<script setup lang="ts">
import type { LLMProviderType } from '@locus-agent/shared'
import { useToast } from '@locus-agent/ui'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSettingsConfig, updateSettingsConfig } from '@/api/chat'
import Sidebar from '@/components/Sidebar.vue'
import { useChatStore } from '@/stores/chat'

const router = useRouter()
const toast = useToast()
const chatStore = useChatStore()

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
  model: '',
  port: 3000,
})

const providerOptions = [
  { value: 'openai' as const, label: 'OpenAI' },
  { value: 'anthropic' as const, label: 'Anthropic（Claude）' },
  { value: 'moonshotai' as const, label: 'Moonshot AI（Kimi）' },
  { value: 'openrouter' as const, label: 'OpenRouter' },
]

const hasExistingApiKey = computed(() => {
  return !!currentApiKeyMasked.value
})

const apiKeyPlaceholder = computed(() => {
  if (!hasExistingApiKey.value)
    return '请输入 API Key'
  return currentApiKeyMasked.value || '**************'
})

const apiKeyHelperText = computed(() => {
  return hasExistingApiKey.value ? '' : '首次配置请填写 API Key'
})

const defaultModels: Record<LLMProviderType, string> = {
  openai: 'gpt-5.3',
  anthropic: 'claude-opus-4.6',
  moonshotai: 'kimi-k2.5',
  openrouter: 'moonshotai/kimi-k2.5',
}

const defaultApiBases: Record<LLMProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  moonshotai: 'https://api.moonshot.cn/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

const modelPlaceholder = computed(() => defaultModels[form.value.provider])
const apiBasePlaceholder = computed(() => defaultApiBases[form.value.provider])

watch(() => form.value.provider, (provider) => {
  if (isLoading.value)
    return
  form.value.apiBase = defaultApiBases[provider] ?? ''
  form.value.model = ''
  form.value.apiKey = ''
  currentApiKeyMasked.value = apiKeysMasked.value[provider] ?? null
})

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
    form.value.apiBase = config.apiBase || defaultApiBases[config.provider] || ''
    form.value.model = config.model ?? ''
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
    const model = form.value.model.trim()

    const payload: {
      provider: LLMProviderType
      apiKey?: string
      apiBase: string
      model: string
      port: number
    } = {
      provider: form.value.provider,
      apiBase,
      model,
      port,
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
    }

    await chatStore.loadModelSettings()
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <Sidebar />

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

        <div class="flex items-center gap-1">
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
        <div class="container-chat p-4 space-y-6">
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
            <!-- LLM -->
            <section class="card p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-sm font-medium text-foreground">
                    模型配置
                  </h2>
                  <p class="text-xs text-muted-foreground mt-1">
                    保存后会立即影响新的对话请求。
                  </p>
                </div>
                <div
                  v-if="runtimeInfo"
                  class="text-xs text-gray-400 text-right"
                >
                  <div>运行中：{{ runtimeInfo.provider }} · {{ runtimeInfo.model }}</div>
                  <div>上下文窗口：{{ runtimeInfo.contextWindow }}</div>
                </div>
              </div>

              <div class="mt-4 grid gap-4">
                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">提供方</label>
                  <select v-model="form.provider" class="input-field">
                    <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </div>

                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">API Key</label>
                  <input
                    v-model="form.apiKey"
                    class="input-field font-mono"
                    type="password"
                    autocomplete="new-password"
                    :placeholder="apiKeyPlaceholder"
                  >
                  <p v-if="apiKeyHelperText" class="text-xs text-muted-foreground">
                    {{ apiKeyHelperText }}
                  </p>
                </div>

                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">API Base URL</label>
                  <input
                    v-model="form.apiBase"
                    class="input-field"
                    type="text"
                    :placeholder="apiBasePlaceholder"
                  >
                </div>

                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">模型名称</label>
                  <input
                    v-model="form.model"
                    class="input-field font-mono"
                    type="text"
                    :placeholder="modelPlaceholder"
                  >
                </div>
              </div>
            </section>

            <!-- Server -->
            <section class="card p-4">
              <div>
                <h2 class="text-sm font-medium text-foreground">
                  服务端
                </h2>
                <p class="text-xs text-muted-foreground mt-1">
                  端口修改需要重启后生效。
                </p>
              </div>

              <div class="mt-4 grid gap-4">
                <div class="grid gap-1.5">
                  <label class="text-xs text-muted-foreground">端口</label>
                  <input
                    v-model.number="form.port"
                    class="input-field"
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="3000"
                  >
                </div>

                <div
                  v-if="requiresRestart"
                  class="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                >
                  端口已保存，重启服务后生效。
                </div>
              </div>
            </section>

            <div class="flex items-center justify-end gap-2">
              <button
                class="btn-ghost"
                :disabled="isSaving"
                @click="router.push({ name: 'chat' })"
              >
                返回
              </button>
              <button
                class="btn-primary"
                :disabled="isSaving"
                @click="saveConfig"
              >
                <span v-if="isSaving" class="i-carbon-circle-dash h-4 w-4 animate-spin mr-2" />
                保存
              </button>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>
