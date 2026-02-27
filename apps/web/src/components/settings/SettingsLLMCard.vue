<script setup lang="ts">
import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'
import { DEFAULT_API_BASES, LLM_PROVIDERS } from '@locus-agent/shared'
import { computed, watch } from 'vue'

const props = defineProps<{
  runtimeInfo: { provider: string, model: string, contextWindow: number } | null
  requiresRestart: boolean
  isLoading: boolean
  apiKeysMasked: Partial<Record<LLMProviderType, string | null>>
}>()

const emit = defineEmits<{
  submit: []
}>()

const form = defineModel<{
  provider: LLMProviderType
  apiKey: string
  apiBase: string
  customMode: CustomProviderMode
  port: number
}>('form', { required: true })

const currentApiKeyMasked = defineModel<string | null>('currentApiKeyMasked', { required: true })

const isCustomProvider = computed(() => form.value.provider === 'custom')

const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.value, label: p.label }))

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

const apiBasePlaceholder = computed(() => {
  if (form.value.provider === 'custom')
    return 'https://api.example.com/v1'
  return DEFAULT_API_BASES[form.value.provider]
})

watch(() => form.value.provider, (provider) => {
  if (props.isLoading)
    return
  form.value.apiBase = provider === 'custom' ? '' : (DEFAULT_API_BASES[provider] ?? '')
  form.value.apiKey = ''
  currentApiKeyMasked.value = props.apiKeysMasked[provider] ?? null
  if (provider !== 'custom')
    form.value.customMode = 'openai-compatible'
})
</script>

<template>
  <!-- LLM -->
  <form class="card p-4" @submit.prevent="emit('submit')">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-medium text-foreground">
          模型配置
        </h2>
        <p class="text-xs text-muted-foreground mt-1">
          保存后立即生效
        </p>
      </div>
      <div
        v-if="runtimeInfo"
        class="text-xs text-gray-400 text-right hidden sm:block"
      >
        <div>
          <span class="font-mono">{{ runtimeInfo.provider }}</span>
        </div>
        <div class="truncate max-w-[120px]">
          {{ runtimeInfo.model }}
        </div>
      </div>
    </div>

    <div class="mt-4 grid gap-4">
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">提供方</label>
        <div class="relative">
          <select v-model="form.provider" class="select-field">
            <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <div class="i-carbon-chevron-down absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      <!-- 自定义提供商模式选择 -->
      <div v-if="isCustomProvider" class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">兼容模式</label>
        <div class="relative">
          <select v-model="form.customMode" class="select-field">
            <option value="openai-compatible">
              OpenAI 兼容
            </option>
            <option value="anthropic-compatible">
              Anthropic 兼容
            </option>
          </select>
          <div class="i-carbon-chevron-down absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
        <p class="text-xs text-muted-foreground">
          选择与你自定义服务 API 格式兼容的模式
        </p>
      </div>

      <!-- Hidden username field for password manager accessibility -->
      <input
        type="text"
        :value="form.provider"
        autocomplete="username"
        class="hidden"
        aria-hidden="true"
        tabindex="-1"
      >

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
    </div>
    <p class="mt-3 text-xs text-muted-foreground/60">
      模型名称可在对话界面底部直接切换。
    </p>
  </form>

  <!-- Server -->
  <section class="card p-4">
    <div>
      <h2 class="text-sm font-medium text-foreground">
        服务端
      </h2>
      <p class="text-xs text-muted-foreground mt-1">
        端口修改需重启生效
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
</template>
