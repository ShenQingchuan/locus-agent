import type { Conversation } from '@univedge/locus-agent-sdk'
import type { Ref } from 'vue'
import { generateConversationTitle, updateConversation } from '@/api/conversations'

export function useChatConversationTitle(
  conversations: Ref<Conversation[]>,
) {
  async function generateTitle(conversationId: string) {
    try {
      const title = await generateConversationTitle(conversationId)
      if (title) {
        const idx = conversations.value.findIndex(c => c.id === conversationId)
        if (idx !== -1) {
          conversations.value[idx] = { ...conversations.value[idx]!, title }
        }
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to generate title:', err)
    }
  }

  async function updateTitle(conversationId: string, title: string) {
    try {
      const updated = await updateConversation(conversationId, { title })
      if (updated) {
        const idx = conversations.value.findIndex(c => c.id === conversationId)
        if (idx !== -1) {
          conversations.value[idx] = { ...conversations.value[idx]!, title: updated.title }
        }
      }
    }
    catch (err) {
      console.warn('[chat store] Failed to update title:', err)
    }
  }

  return {
    generateTitle,
    updateTitle,
  }
}
