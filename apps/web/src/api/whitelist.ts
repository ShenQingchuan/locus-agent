import type { WhitelistRule } from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

export async function fetchWhitelistRules(conversationId?: string): Promise<WhitelistRule[]> {
  try {
    const params = conversationId ? `?conversationId=${conversationId}` : ''
    const data = await apiClient.get<{ rules?: WhitelistRule[] }>(`/api/chat/whitelist${params}`)
    return data.rules ?? []
  }
  catch {
    return []
  }
}

export async function deleteWhitelistRule(ruleId: string): Promise<boolean> {
  try {
    const data = await apiClient.del<{ success: boolean }>(`/api/chat/whitelist/${ruleId}`)
    return data.success
  }
  catch {
    return false
  }
}
