import type { LLMSettings } from '@locus-agent/server/settings'
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
          ],
        }),

      apiKey: ({ results }) => {
        const providerNames = {
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          moonshotai: 'Moonshot AI',
          openrouter: 'OpenRouter',
        } as const
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

      apiBase: ({ results }) => {
        const defaultBase = DEFAULT_API_BASES[results.provider!]
        return p.text({
          message: `Custom API base URL (default: ${defaultBase})`,
          placeholder: defaultBase,
          initialValue: existing?.apiBase ?? '',
        })
      },

      model: ({ results }) => {
        const placeholders = {
          openai: 'gpt-4o',
          anthropic: 'claude-sonnet-4-20250514',
          moonshotai: 'kimi-k2.5',
          openrouter: 'moonshotai/kimi-k2.5',
        } as const
        return p.text({
          message: 'Model name (leave empty for default)',
          placeholder: placeholders[results.provider!],
          initialValue: existing?.model ?? '',
        })
      },

      port: () =>
        p.text({
          message: 'Server port',
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
  const apiBase = apiBaseRaw || (DEFAULT_API_BASES[result.provider] ?? undefined)

  return {
    provider: result.provider,
    apiKey: (result.apiKey as string) || existing?.apiKey as string,
    apiBase,
    model: (result.model as string) || undefined,
    port: Number(result.port) || 3000,
  }
}
