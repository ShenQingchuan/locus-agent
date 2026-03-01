import type { ConversationSpace } from '@locus-agent/shared'
import { ref } from 'vue'

export interface ConversationScope {
  space: ConversationSpace
  projectKey?: string
}

interface ConversationScopeState {
  currentConversationId: string | null
  yoloMode: boolean
}

export function createConversationScopeState() {
  const currentConversationId = ref<string | null>(null)
  const conversationScope = ref<ConversationScope>({ space: 'chat' })
  const yoloMode = ref(false)

  const scopeStates = ref<Record<string, ConversationScopeState>>({
    'chat:': {
      currentConversationId: null,
      yoloMode: false,
    },
  })

  function normalizeScope(scope: ConversationScope): ConversationScope {
    return {
      space: scope.space,
      projectKey: scope.projectKey?.trim() || undefined,
    }
  }

  function getScopeKey(scope: ConversationScope): string {
    return `${scope.space}:${scope.projectKey ?? ''}`
  }

  function setConversationScope(
    scope: ConversationScope,
    options: { onNoActiveConversation?: () => void } = {},
  ) {
    const nextScope = normalizeScope(scope)
    const currentScope = normalizeScope(conversationScope.value)
    const currentKey = getScopeKey(currentScope)
    const nextKey = getScopeKey(nextScope)

    scopeStates.value[currentKey] = {
      currentConversationId: currentConversationId.value,
      yoloMode: yoloMode.value,
    }

    if (currentKey === nextKey)
      return

    conversationScope.value = nextScope
    const nextState = scopeStates.value[nextKey]
    currentConversationId.value = nextState?.currentConversationId ?? null
    yoloMode.value = nextState?.yoloMode ?? false

    if (!currentConversationId.value)
      options.onNoActiveConversation?.()
  }

  return {
    currentConversationId,
    conversationScope,
    yoloMode,
    normalizeScope,
    getScopeKey,
    setConversationScope,
  }
}
