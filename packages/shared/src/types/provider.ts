export type LLMProviderType = 'openai' | 'anthropic' | 'moonshotai' | 'openrouter'

export interface LLMProviderMeta {
  value: LLMProviderType
  label: string
  icon: string
  defaultModel: string
  defaultApiBase: string
}

export const LLM_PROVIDERS: LLMProviderMeta[] = [
  { value: 'openai', label: 'OpenAI', icon: 'i-simple-icons:openai', defaultModel: 'gpt-5.3', defaultApiBase: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', icon: 'i-simple-icons:anthropic', defaultModel: 'claude-opus-4.6', defaultApiBase: 'https://api.anthropic.com' },
  { value: 'moonshotai', label: 'Moonshot AI', icon: 'i-carbon-moon', defaultModel: 'kimi-k2.5', defaultApiBase: 'https://api.moonshot.cn/v1' },
  { value: 'openrouter', label: 'OpenRouter', icon: 'i-simple-icons:openrouter', defaultModel: 'moonshotai/kimi-k2.5', defaultApiBase: 'https://openrouter.ai/api/v1' },
]

export const DEFAULT_MODELS: Record<LLMProviderType, string> = Object.fromEntries(
  LLM_PROVIDERS.map(p => [p.value, p.defaultModel]),
) as Record<LLMProviderType, string>

export const DEFAULT_API_BASES: Record<LLMProviderType, string> = Object.fromEntries(
  LLM_PROVIDERS.map(p => [p.value, p.defaultApiBase]),
) as Record<LLMProviderType, string>
