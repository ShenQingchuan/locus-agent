<script setup lang="ts">
import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'
import { DEFAULT_API_BASES, DEFAULT_MODELS, getCodingProviderForParent, LLM_PROVIDERS } from '@locus-agent/shared'
import { computed, ref, watch } from 'vue'

export interface ProviderConfig {
  apiKey: string
  apiBase: string
  customMode: CustomProviderMode
  model: string
}

export interface ProviderConfigs {
  [provider: string]: ProviderConfig
}

export interface CodingKimiConfig {
  hasApiKey: boolean
  apiKeyMasked: string | null
  apiBase: string
  model: string
  /** New key input (not yet saved) */
  newApiKey: string
}

const props = defineProps<{
  runtimeInfo: { provider: string, model: string, contextWindow: number } | null
  requiresRestart: boolean
  isLoading: boolean
  apiKeysMasked: Partial<Record<LLMProviderType, string | null>>
  activeProvider: LLMProviderType
  codingKimi: CodingKimiConfig
}>()

const emit = defineEmits<{
  'submit': []
  'update:activeProvider': [provider: LLMProviderType]
  'kimiCodeSave': [config: { apiKey?: string, apiBase?: string, model?: string }]
}>()

const providerConfigs = defineModel<ProviderConfigs>('providerConfigs', { required: true })
const port = defineModel<number>('port', { required: true })

// Active tab state
const activeTab = ref<LLMProviderType>(props.activeProvider)

// Sync active tab with parent
watch(activeTab, (newTab) => {
  emit('update:activeProvider', newTab)
})

watch(() => props.activeProvider, (newProvider) => {
  activeTab.value = newProvider
})

// Provider options for tabs
const providerTabs = computed(() => {
  return LLM_PROVIDERS.map(p => ({
    value: p.value,
    label: p.label,
    icon: p.icon,
  }))
})

// Check if a provider is the currently active one in runtime
function isActiveProvider(provider: LLMProviderType) {
  return props.runtimeInfo?.provider === provider
}

// Check if a provider has configured API key
function hasApiKey(provider: LLMProviderType) {
  return !!props.apiKeysMasked[provider]
}

// Get placeholder for API key input
function getApiKeyPlaceholder(provider: LLMProviderType) {
  const masked = props.apiKeysMasked[provider]
  if (!masked)
    return '请输入 API Key'
  return masked
}

// Get placeholder for API base input
function getApiBasePlaceholder(provider: LLMProviderType) {
  if (provider === 'custom')
    return 'https://api.example.com/v1'
  return DEFAULT_API_BASES[provider]
}

// Get helper text for API key
function getApiKeyHelperText(provider: LLMProviderType) {
  return hasApiKey(provider) ? '' : '首次配置请填写 API Key'
}

// Check if current tab is custom provider
const isCustomProvider = computed(() => activeTab.value === 'custom')

// Check if current tab has a coding provider section
const codingProviderForTab = computed(() => getCodingProviderForParent(activeTab.value))

// Current active config (guaranteed to exist after ensureProviderConfig)
const currentConfig = computed<ProviderConfig>(() => {
  ensureProviderConfig(activeTab.value)
  return providerConfigs.value[activeTab.value]!
})

// Initialize config for a provider if not exists
function ensureProviderConfig(provider: LLMProviderType) {
  if (!providerConfigs.value[provider]) {
    providerConfigs.value[provider] = {
      apiKey: '',
      apiBase: provider === 'custom' ? '' : (DEFAULT_API_BASES[provider] ?? ''),
      customMode: 'openai-compatible',
      model: DEFAULT_MODELS[provider] ?? '',
    }
  }
}

// Watch for tab changes to ensure config exists
watch(activeTab, (newTab) => {
  ensureProviderConfig(newTab)
}, { immediate: true })

// Watch for provider changes to reset API base when provider changes and apiBase is empty
watch(() => providerConfigs.value[activeTab.value]?.apiBase, (newValue) => {
  const config = providerConfigs.value[activeTab.value]
  if (config && !newValue && activeTab.value !== 'custom') {
    config.apiBase = DEFAULT_API_BASES[activeTab.value] ?? ''
  }
})

// ---------------------------------------------------------------------------
// Kimi Code local state
// ---------------------------------------------------------------------------
const kimiApiKey = ref('')
const kimiApiBase = ref('')
const kimiModel = ref('')

watch(() => props.codingKimi, (v) => {
  kimiApiBase.value = v.apiBase
  kimiModel.value = v.model
}, { immediate: true })

function saveKimiCode() {
  const payload: { apiKey?: string, apiBase?: string, model?: string } = {}
  const trimmedKey = kimiApiKey.value.trim()
  if (trimmedKey)
    payload.apiKey = trimmedKey
  payload.apiBase = kimiApiBase.value.trim() || undefined
  payload.model = kimiModel.value.trim() || undefined
  emit('kimiCodeSave', payload)
  kimiApiKey.value = ''
}
</script>

<template>
  <!-- LLM Multi-Provider Configuration with Tabs -->
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

    <!-- Provider Tabs -->
    <div class="mt-4 border-b border-border">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="tab in providerTabs"
          :key="tab.value"
          type="button"
          class="px-3 py-2 text-xs font-medium rounded-t-lg transition-colors relative border-none outline-none"
          :class="[
            activeTab === tab.value
              ? 'text-foreground bg-muted border-t border-x border-border'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          ]"
          @click="activeTab = tab.value"
        >
          <div class="flex items-center gap-1.5">
            <span :class="tab.icon" class="h-3.5 w-3.5" />
            <span>{{ tab.label }}</span>
            <!-- Active indicator (runtime) -->
            <span
              v-if="isActiveProvider(tab.value)"
              class="ml-1 h-1.5 w-1.5 rounded-full bg-green-500"
              title="当前正在使用"
            />
            <!-- Configured indicator -->
            <span
              v-else-if="hasApiKey(tab.value)"
              class="ml-1 h-1.5 w-1.5 rounded-full bg-blue-400"
              title="已配置 API Key"
            />
          </div>
        </button>
      </div>
    </div>

    <!-- Tab Content -->
    <div class="mt-4 grid gap-4">
      <!-- Custom Provider Mode Selection -->
      <div v-if="isCustomProvider" class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">兼容模式</label>
        <div class="relative">
          <select v-model="currentConfig.customMode" class="select-field">
            <option value="openai-compatible">
              OpenAI 兼容
            </option>
            <option value="anthropic-compatible">
              Anthropic 兼容
            </option>
          </select>
          <div class="i-ic:twotone-keyboard-arrow-down absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>
        <p class="text-xs text-muted-foreground">
          选择与你自定义服务 API 格式兼容的模式
        </p>
      </div>

      <!-- Hidden username field for password manager accessibility -->
      <input
        type="text"
        :value="activeTab"
        autocomplete="username"
        class="hidden"
        aria-hidden="true"
        tabindex="-1"
      >

      <!-- API Key -->
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">API Key</label>
        <input
          v-model="currentConfig.apiKey"
          class="input-field font-mono"
          type="password"
          autocomplete="new-password"
          :placeholder="getApiKeyPlaceholder(activeTab)"
        >
        <p v-if="getApiKeyHelperText(activeTab)" class="text-xs text-muted-foreground">
          {{ getApiKeyHelperText(activeTab) }}
        </p>
      </div>

      <!-- API Base URL -->
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">API Base URL</label>
        <input
          v-model="currentConfig.apiBase"
          class="input-field"
          type="text"
          :placeholder="getApiBasePlaceholder(activeTab)"
        >
      </div>

      <!-- Model Name -->
      <div class="grid gap-1.5">
        <label class="text-xs text-muted-foreground">模型名称</label>
        <input
          v-model="currentConfig.model"
          class="input-field font-mono"
          type="text"
          :placeholder="DEFAULT_MODELS[activeTab] || '输入模型名称'"
        >
        <p class="text-xs text-muted-foreground">
          留空将使用默认值: {{ DEFAULT_MODELS[activeTab] || '无' }}
        </p>
      </div>

      <!-- Current Provider Indicator -->
      <div
        v-if="isActiveProvider(activeTab)"
        class="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-600 dark:text-green-400"
      >
        <div class="flex items-center gap-2">
          <span class="i-carbon-checkmark-filled h-4 w-4" />
          <span>当前正在使用此提供商</span>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- Coding Provider Section (Kimi Code under Moonshot) -->
      <!-- ============================================================ -->
      <template v-if="codingProviderForTab">
        <div class="border-t border-border pt-4 mt-2">
          <h3 class="text-xs font-medium text-foreground mb-3 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <span class="i-custom:moonshot h-3.5 w-3.5" />
              {{ codingProviderForTab.label }} 编码
            </span>
            <span
              v-if="codingKimi.hasApiKey"
              class="text-xs text-green-600 dark:text-green-400 font-normal flex items-center gap-1"
            >
              <span class="i-carbon-checkmark-filled h-3 w-3" />
              已配置
            </span>
          </h3>

          <div class="grid gap-3">
            <p class="text-xs text-muted-foreground">
              采用 Anthropic API 格式，独立配置 API Key 和端点。
            </p>

            <!-- Kimi Code API Key -->
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">Kimi Code API Key</label>
              <input
                v-model="kimiApiKey"
                class="input-field font-mono"
                type="password"
                autocomplete="new-password"
                :placeholder="codingKimi.apiKeyMasked || '请输入 Kimi Code API Key (sk-kimi-...)'"
              >
            </div>

            <!-- Kimi Code API Base -->
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">API 端点</label>
              <input
                v-model="kimiApiBase"
                class="input-field"
                type="text"
                placeholder="https://api.kimi.com/coding/v1"
              >
            </div>

            <!-- Kimi Code Model -->
            <div class="grid gap-1.5">
              <label class="text-xs text-muted-foreground">模型名称</label>
              <input
                v-model="kimiModel"
                class="input-field font-mono"
                type="text"
                placeholder="kimi-k2.5"
              >
            </div>

            <button
              type="button"
              class="btn-outline btn-sm"
              @click="saveKimiCode"
            >
              保存 Kimi Code 配置
            </button>
          </div>
        </div>
      </template>
    </div>

    <p class="mt-3 text-xs text-muted-foreground/60">
      模型名称可在对话界面底部直接切换。点击上方标签切换不同提供商进行配置。
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
          v-model.number="port"
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
