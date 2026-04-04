import type { CodingExecutorType, Conversation, LLMProviderType } from '@univedge/locus-agent-sdk'
import type { Message } from '@/composables/assistant-runtime'
import type { ConversationScope } from '@/composables/useConversationScopeState'
import { ACP_CODING_PROVIDERS, CODING_PROVIDERS, DEFAULT_MODELS, isACPCodingProvider, isCodingModelProvider } from '@univedge/locus-agent-sdk'

export function computeBackendKeepCount(history: Message[]): number {
  let backendKeepCount = 0
  for (const m of history) {
    backendKeepCount++
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.some(tc => tc.result)) {
      backendKeepCount++
    }
  }
  return backendKeepCount
}

export interface BuildAssistantModelState {
  conversationScope: ConversationScope
  codingExecutor: CodingExecutorType | null
  provider: LLMProviderType
  modelName: string
}

export function buildAssistantModel(state: BuildAssistantModelState): string {
  const executor = state.codingExecutor
  if (state.conversationScope.space === 'coding' && executor) {
    if (isCodingModelProvider(executor))
      return `${executor}/${CODING_PROVIDERS.find(cp => cp.value === executor)?.defaultModel || 'unknown'}`
    if (isACPCodingProvider(executor))
      return `acp/${ACP_CODING_PROVIDERS.find(cp => cp.value === executor)?.value || executor}`
  }
  const selectedModel = (state.modelName || DEFAULT_MODELS[state.provider] || 'unknown').trim()
  return `${state.provider}/${selectedModel}`
}

export function createOptimisticConversation(content: string, scope: ConversationScope, yoloMode: boolean): Conversation {
  const id = crypto.randomUUID()
  const now = new Date()
  const trimmedContent = content.trim()
  return {
    id,
    title: trimmedContent
      ? (trimmedContent.length > 50 ? `${trimmedContent.substring(0, 50)}...` : trimmedContent)
      : '图片对话',
    space: scope.space,
    projectKey: scope.projectKey ?? null,
    confirmMode: !yoloMode,
    createdAt: now,
    updatedAt: now,
  }
}
