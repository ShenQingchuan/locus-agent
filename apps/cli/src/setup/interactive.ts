import type { LLMSettings } from '@locus-agent/server/settings'
import type { CustomProviderMode } from '@locus-agent/shared'
import { exit } from 'node:process'
import * as p from '@clack/prompts'
import { DEFAULT_API_BASES } from '@locus-agent/shared'

export interface SetupResult extends LLMSettings {
  port: number
}

/**
 * 交互式配置
 */
export async function runSetup(existing?: LLMSettings | null, existingPort?: number): Promise<SetupResult> {
  p.intro('Locus Agent Setup')

  const result = await p.group(
    {
      provider: () =>
        p.select({
          message: 'Select your LLM provider',
          initialValue: existing?.provider ?? 'openai',
          options: [
            { value: 'openai' as const, label: 'OpenAI', hint: 'GPT-5.3, DeepSeek, etc.' },
            { value: 'anthropic' as const, label: 'Anthropic', hint: 'Claude Sonnet, etc.' },
            { value: 'moonshotai' as const, label: 'Moonshot AI', hint: 'Kimi' },
            { value: 'openrouter' as const, label: 'OpenRouter', hint: '300+ models, unified API' },
            { value: 'deepseek' as const, label: 'DeepSeek', hint: 'DeepSeek Chat, Reasoner' },
            { value: 'custom' as const, label: '自定义来源', hint: 'Custom API endpoint' },
          ],
        }),

      apiKey: ({ results }) => {
        const providerNames: Record<string, string> = {
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          moonshotai: 'Moonshot AI',
          openrouter: 'OpenRouter',
          deepseek: 'DeepSeek',
          custom: 'Custom Provider',
        }
        const providerName = providerNames[results.provider!]
        const maskedKey = existing?.apiKey
          ? `${existing.apiKey.slice(0, 6)}...${existing.apiKey.slice(-4)}`
          : undefined
        return p.password({
          message: maskedKey
            ? `${providerName} API key (current: ${maskedKey}, press Enter to keep)`
            : `Enter your ${providerName} API key`,
          validate: (value) => {
            if (!existing?.apiKey && (!value || value.trim().length === 0))
              return 'API key is required'
          },
        })
      },

      customMode: ({ results }) => {
        if (results.provider !== 'custom')
          return Promise.resolve(undefined)
        return p.select({
          message: 'Select your custom provider API compatibility mode',
          initialValue: existing?.customMode ?? 'openai-compatible',
          options: [
            { value: 'openai-compatible' as const, label: 'OpenAI 兼容模式', hint: 'OpenAI API format' },
            { value: 'anthropic-compatible' as const, label: 'Anthropic 兼容模式', hint: 'Anthropic API format' },
          ],
        })
      },

      apiBase: ({ results }) => {
        const isCustom = results.provider === 'custom'
        const defaultBase = isCustom ? '' : DEFAULT_API_BASES[results.provider!]
        return p.text({
          message: isCustom
            ? 'Custom API base URL (required for custom provider)'
            : `Custom API base URL (default: ${defaultBase})`,
          placeholder: isCustom ? 'https://api.example.com/v1' : defaultBase,
          initialValue: existing?.apiBase ?? '',
          validate: (value) => {
            if (isCustom && (!value || value.trim().length === 0))
              return 'API base URL is required for custom provider'
          },
        })
      },

      model: ({ results }) => {
        const placeholders: Record<string, string> = {
          openai: 'gpt-5.3',
          anthropic: 'claude-opus-4-6',
          moonshotai: 'kimi-k2.5',
          openrouter: 'moonshotai/kimi-k2.5',
          deepseek: 'deepseek-chat',
          custom: 'claude-opus-4-6',
        }
        return p.text({
          message: '模型名称 (留空使用默认)',
          placeholder: placeholders[results.provider!] || 'claude-opus-4-6',
          initialValue: existing?.model ?? '',
        })
      },

      port: () =>
        p.text({
          message: '服务器端口',
          placeholder: '3000',
          initialValue: String(existingPort ?? 3000),
          validate: (value) => {
            const n = Number(value)
            if (!value || Number.isNaN(n) || n < 1 || n > 65535)
              return 'Port must be a number between 1 and 65535'
          },
        }),
    },
    {
      onCancel: () => {
        p.cancel('Setup cancelled.')
        exit(0)
      },
    },
  )

  p.outro('Configuration saved!')

  const apiBaseRaw = (result.apiBase as string)?.trim()
  const isCustom = result.provider === 'custom'
  const apiBase = isCustom ? apiBaseRaw : (apiBaseRaw || (DEFAULT_API_BASES[result.provider] ?? undefined))

  return {
    provider: result.provider,
    apiKey: (result.apiKey as string) || existing?.apiKey as string,
    apiBase,
    model: (result.model as string) || undefined,
    customMode: result.customMode as CustomProviderMode || undefined,
    port: Number(result.port) || 3000,
  }
}
