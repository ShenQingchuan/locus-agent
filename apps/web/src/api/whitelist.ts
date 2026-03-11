import type { WhitelistRule } from '@univedge/locus-agent-sdk'

export async function fetchWhitelistRules(conversationId?: string): Promise<WhitelistRule[]> {
  try {
    const params = conversationId ? `?conversationId=${conversationId}` : ''
    const response = await fetch(`/api/chat/whitelist${params}`)
    if (!response.ok)
      return []
    const data = await response.json()
    return data.rules ?? []
  }
  catch (error) {
    console.error('Failed to fetch whitelist rules:', error)
    return []
  }
}

export async function deleteWhitelistRule(ruleId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/chat/whitelist/${ruleId}`, {
      method: 'DELETE',
    })
    if (!response.ok)
      return false
    const data = await response.json()
    return data.success
  }
  catch (error) {
    console.error('Failed to delete whitelist rule:', error)
    return false
  }
}
