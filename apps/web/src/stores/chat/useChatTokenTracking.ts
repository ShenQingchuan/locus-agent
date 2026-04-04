import type { Ref } from 'vue'
import type { Message } from '@/composables/assistant-runtime'
import { computed } from 'vue'

export function useChatTokenTracking(
  messages: Ref<Message[]>,
  messagesToCoreMessages: (msgs: Message[]) => import('@univedge/locus-agent-sdk').CoreMessage[],
  estimateCoreMessageTokens: (cm: import('@univedge/locus-agent-sdk').CoreMessage) => number,
  maxContextTokens: Ref<number>,
) {
  const BASE_CONTEXT_OVERHEAD_TOKENS = 250
  const _tokenCache = new Map<string, { ref: Message, tokens: number }>()

  const contextTokensUsed = computed(() => {
    const msgs = messages.value
    if (msgs.length === 0) {
      _tokenCache.clear()
      return 0
    }

    const currentIds = new Set<string>()
    let total = BASE_CONTEXT_OVERHEAD_TOKENS

    for (const msg of msgs) {
      currentIds.add(msg.id)
      const cached = _tokenCache.get(msg.id)

      if (cached && cached.ref === msg) {
        total += cached.tokens
        continue
      }

      const coreMessages = messagesToCoreMessages([msg])
      let msgTokens = 0
      for (const cm of coreMessages) {
        msgTokens += estimateCoreMessageTokens(cm)
      }
      _tokenCache.set(msg.id, { ref: msg, tokens: msgTokens })
      total += msgTokens
    }

    if (_tokenCache.size > currentIds.size) {
      for (const key of _tokenCache.keys()) {
        if (!currentIds.has(key))
          _tokenCache.delete(key)
      }
    }

    return total
  })

  const contextUsagePercentage = computed(() => {
    const total = maxContextTokens.value
    if (total <= 0)
      return 0
    return Math.min(100, (contextTokensUsed.value / total) * 100)
  })

  return {
    contextTokensUsed,
    contextUsagePercentage,
  }
}
