import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { Ref } from 'vue'
import type { Message } from '@/composables/assistant-runtime'
import { ref } from 'vue'

export function useChatMessageEditing(messages: Ref<Message[]>) {
  const editingMessageId = ref<string | null>(null)
  const editingContent = ref<string>('')
  const editingAttachments = ref<MessageImageAttachment[]>([])

  function startEditMessage(messageId: string) {
    const message = messages.value.find(m => m.id === messageId)
    if (!message || message.role !== 'user') {
      console.warn('[startEditMessage] 只能编辑用户消息')
      return
    }
    editingMessageId.value = messageId
    editingContent.value = message.content
    editingAttachments.value = [...(message.attachments ?? [])]
  }

  function cancelEditMessage() {
    editingMessageId.value = null
    editingContent.value = ''
    editingAttachments.value = []
  }

  return {
    editingMessageId,
    editingContent,
    editingAttachments,
    startEditMessage,
    cancelEditMessage,
  }
}
