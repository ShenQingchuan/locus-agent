import type { WhitelistRule } from '@univedge/locus-agent-sdk'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { deleteWhitelistRule, fetchWhitelistRules } from '@/api/whitelist'

export const useWhitelistStore = defineStore('whitelist', () => {
  const whitelistRules = ref<WhitelistRule[]>([])

  async function loadWhitelistRules(conversationId?: string | null) {
    const rules = await fetchWhitelistRules(conversationId || undefined)
    whitelistRules.value = rules
  }

  async function removeWhitelistRule(ruleId: string) {
    const success = await deleteWhitelistRule(ruleId)
    if (success) {
      whitelistRules.value = whitelistRules.value.filter(r => r.id !== ruleId)
    }
    return success
  }

  return {
    whitelistRules,
    loadWhitelistRules,
    removeWhitelistRule,
  }
})
