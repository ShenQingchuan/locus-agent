import type { LLMSettings } from '../settings.js'
import { exit } from 'node:process'
import * as p from '@clack/prompts'

/**
 * 交互式配置 LLM 设置
 */
export async function runSetup(existing?: LLMSettings | null): Promise<LLMSettings> {
  p.intro('Locus Agent Setup')

  const result = await p.group(
    {
      provider: () =>
        p.select({
          message: 'Select your LLM provider',
          initialValue: existing?.provider ?? 'openai',
          options: [
            { value: 'openai' as const, label: 'OpenAI / Compatible', hint: 'GPT-4o, Kimi, DeepSeek, etc.' },
            { value: 'anthropic' as const, label: 'Anthropic', hint: 'Claude Sonnet, etc.' },
          ],
        }),

      apiKey: ({ results }) =>
        p.password({
          message: `Enter your ${results.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key`,
          validate: (value) => {
            if (!value || value.trim().length === 0)
              return 'API key is required'
          },
        }),

      apiBase: ({ results }) =>
        p.text({
          message: results.provider === 'openai'
            ? 'Custom API base URL (leave empty for official OpenAI)'
            : 'Custom API base URL (leave empty for official Anthropic)',
          placeholder: 'https://api.example.com/v1',
          initialValue: existing?.apiBase ?? '',
        }),

      model: ({ results }) =>
        p.text({
          message: 'Model name (leave empty for default)',
          placeholder: results.provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
          initialValue: existing?.model ?? '',
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

  return {
    provider: result.provider,
    apiKey: result.apiKey as string,
    apiBase: (result.apiBase as string) || undefined,
    model: (result.model as string) || undefined,
  }
}
