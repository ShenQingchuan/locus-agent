export type LLMProviderType = 'openai' | 'anthropic' | 'moonshotai' | 'openrouter' | 'deepseek' | 'zhipu' | 'custom'

export type CustomProviderMode = 'openai-compatible' | 'anthropic-compatible'

export interface LLMProviderMeta {
  value: LLMProviderType
  label: string
  icon: string
  defaultModel: string
  defaultApiBase: string
}

export const LLM_PROVIDERS: LLMProviderMeta[] = [
  { value: 'openai', label: 'OpenAI', icon: 'i-simple-icons:openai', defaultModel: 'gpt-5.4', defaultApiBase: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', icon: 'i-simple-icons:anthropic', defaultModel: 'claude-opus-4.6', defaultApiBase: 'https://api.anthropic.com' },
  { value: 'moonshotai', label: 'Moonshot AI', icon: 'i-custom:moonshot', defaultModel: 'kimi-k2.5', defaultApiBase: 'https://api.moonshot.cn/v1' },
  { value: 'openrouter', label: 'OpenRouter', icon: 'i-simple-icons:openrouter', defaultModel: 'moonshotai/kimi-k2.5', defaultApiBase: 'https://openrouter.ai/api/v1' },
  { value: 'deepseek', label: 'DeepSeek', icon: 'i-ri:deepseek-fill', defaultModel: 'deepseek-chat', defaultApiBase: 'https://api.deepseek.com' },
  { value: 'zhipu', label: '智谱清言', icon: 'i-custom:zai', defaultModel: 'glm-5', defaultApiBase: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'custom', label: '自定义来源', icon: 'i-tabler:message-chatbot-filled', defaultModel: 'claude-opus-4-6', defaultApiBase: '' },
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
 * Custom provider keeps the model name as-is.
 */
// ---------------------------------------------------------------------------
// Coding provider types (Kimi Code under Moonshot)
// ---------------------------------------------------------------------------

export type CodingProviderType = 'kimi-code'

export interface CodingProviderMeta {
  value: CodingProviderType
  label: string
  /** Which main LLM provider tab this coding provider lives under */
  parentProvider: LLMProviderType
  defaultModel: string
  defaultApiBase: string
  /** 'api-key' = normal key input */
  authMode: 'api-key'
  /** SDK format used for API calls */
  apiFormat: 'anthropic'
}

export const CODING_PROVIDERS: CodingProviderMeta[] = [
  {
    value: 'kimi-code',
    label: 'Kimi Code',
    parentProvider: 'moonshotai',
    defaultModel: 'kimi-k2.5',
    defaultApiBase: 'https://api.kimi.com/coding/v1',
    authMode: 'api-key',
    apiFormat: 'anthropic',
  },
]

/** Look up which coding provider belongs to a given main provider tab */
export function getCodingProviderForParent(parent: LLMProviderType): CodingProviderMeta | undefined {
  return CODING_PROVIDERS.find(cp => cp.parentProvider === parent)
}

export function normalizeModelForProvider(model: string, provider: LLMProviderType): string {
  const trimmed = model.trim()
  if (provider === 'openrouter' || provider === 'custom')
    return trimmed
  const prefix = `${provider}/`
  if (trimmed.startsWith(prefix))
    return trimmed.slice(prefix.length).trim() || DEFAULT_MODELS[provider]
  return trimmed
}
