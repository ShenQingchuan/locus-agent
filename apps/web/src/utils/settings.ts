import type { CustomProviderMode, LLMProviderType } from '@univedge/locus-agent-sdk'
import type { ProviderConfigs } from '@/components/settings/SettingsLLMCard.vue'
import { DEFAULT_API_BASES, DEFAULT_MODELS, LLM_PROVIDERS } from '@univedge/locus-agent-sdk'

export function initProviderConfig(
  providerConfigs: ProviderConfigs,
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

export function initAllProviderConfigs(providerConfigs: ProviderConfigs): void {
  for (const p of LLM_PROVIDERS) {
    if (!providerConfigs[p.value])
      initProviderConfig(providerConfigs, p.value, null)
  }
}
