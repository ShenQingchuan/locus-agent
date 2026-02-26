export type LLMProviderType = 'openai' | 'anthropic' | 'moonshotai' | 'openrouter' | 'deepseek'

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
  { value: 'moonshotai', label: 'Moonshot AI', icon: 'i-custom:moonshot', defaultModel: 'kimi-k2.5', defaultApiBase: 'https://api.moonshot.cn/v1' },
  { value: 'openrouter', label: 'OpenRouter', icon: 'i-simple-icons:openrouter', defaultModel: 'moonshotai/kimi-k2.5', defaultApiBase: 'https://openrouter.ai/api/v1' },
  { value: 'deepseek', label: 'DeepSeek', icon: 'i-ri:deepseek-fill', defaultModel: 'deepseek-chat', defaultApiBase: 'https://api.deepseek.com' },
]

export const DEFAULT_MODELS: Record<LLMProviderType, string> = Object.fromEntries(
  LLM_PROVIDERS.map(p => [p.value, p.defaultModel]),
) as Record<LLMProviderType, string>

export const DEFAULT_API_BASES: Record<LLMProviderType, string> = Object.fromEntries(
  LLM_PROVIDERS.map(p => [p.value, p.defaultApiBase]),
) as Record<LLMProviderType, string>

/**
 * Normalize model name for the given provider.
 * OpenRouter uses provider/model format (e.g. moonshotai/kimi-k2.5).
 * Direct providers use model-only format from DEFAULT_MODELS.
 * Strip provider prefix when using direct provider.
 */
export function normalizeModelForProvider(model: string, provider: LLMProviderType): string {
  const trimmed = model.trim()
  if (provider === 'openrouter')
    return trimmed
  const prefix = `${provider}/`
  if (trimmed.startsWith(prefix))
    return trimmed.slice(prefix.length).trim() || DEFAULT_MODELS[provider]
  return trimmed
}
