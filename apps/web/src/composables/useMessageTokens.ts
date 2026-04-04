import type { MaybeRefOrGetter } from 'vue'
import type { Message } from './assistant-runtime'
import { DEFAULT_MODELS } from '@univedge/locus-agent-sdk'
import { computed, toValue } from 'vue'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'

export interface UseMessageTokensOptions {
  message: MaybeRefOrGetter<Message>
  provider: MaybeRefOrGetter<string>
  modelName: MaybeRefOrGetter<string>
}

export function useMessageTokens(options: UseMessageTokensOptions) {
  const msg = () => toValue(options.message)

  const estimateModelHint = computed(() => {
    const message = msg()
    if (message.role === 'assistant' && message.model)
      return message.model
    const selectedModel = (toValue(options.modelName) || (DEFAULT_MODELS as Record<string, string>)[toValue(options.provider)] || '').trim()
    return selectedModel || undefined
  })

  function estimateTokensFromText(text: string, modelHint?: string): number {
    return countTextTokens(text, modelHint)
  }

  const messageTokens = computed<number | null>(() => {
    const message = msg()

    if (message.isStreaming)
      return null

    const hint = estimateModelHint.value

    if (message.role === 'assistant') {
      let estimate = estimateTokensFromText(message.content, hint)
      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const tc of message.toolCalls) {
          estimate += estimateTokensFromText(tc.toolCall.toolCallId, hint)
          estimate += estimateTokensFromText(tc.toolCall.toolName, hint)
          estimate += countUnknownTokens(tc.toolCall.args, hint)
          if (tc.result) {
            estimate += estimateTokensFromText(tc.result.toolCallId, hint)
            estimate += estimateTokensFromText(tc.result.toolName, hint)
            estimate += countUnknownTokens(tc.result.result, hint)
          }
        }
      }
      return estimate > 0 ? estimate : null
    }

    const estimate = estimateTokensFromText(message.content, hint)
    return estimate > 0 ? estimate : null
  })

  const isEstimatedTokens = computed(() => {
    return !msg().isStreaming
  })

  const messageTokensText = computed(() => {
    if (messageTokens.value === null)
      return null
    return isEstimatedTokens.value
      ? `~${messageTokens.value} tokens`
      : `${messageTokens.value} tokens`
  })

  const reasoningTokens = computed<number | null>(() => {
    const message = msg()
    if (message.role !== 'assistant' || !message.reasoning)
      return null
    return estimateTokensFromText(message.reasoning, estimateModelHint.value) || null
  })

  const messageTokensTitle = computed<string | undefined>(() => {
    const message = msg()
    if (message.isStreaming)
      return undefined
    const parts: string[] = ['上下文贡献估算']
    if (reasoningTokens.value) {
      parts.push(`思考: ~${reasoningTokens.value}（不计入上下文）`)
    }
    if (message.role === 'assistant' && message.usage) {
      parts.push(`API 用量 — 输出: ${message.usage.completionTokens} · 输入: ${message.usage.promptTokens} · 总计: ${message.usage.totalTokens}`)
    }
    return parts.join(' · ')
  })

  const assistantModelLabel = computed<string | null>(() => {
    const message = msg()
    if (message.role !== 'assistant')
      return null
    return message.model || '未记录模型'
  })

  return {
    estimateModelHint,
    estimateTokensFromText,
    messageTokens,
    isEstimatedTokens,
    messageTokensText,
    reasoningTokens,
    messageTokensTitle,
    assistantModelLabel,
  }
}
