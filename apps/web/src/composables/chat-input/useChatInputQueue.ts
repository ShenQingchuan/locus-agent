import type { QueuedMessage } from '@/composables/assistant-runtime'
import { nextTick, ref } from 'vue'

export function useChatInputQueue(
  editQueueItem: (id: string, content: string) => void,
  removeFromQueue: (id: string) => void,
) {
  const editingQueueId = ref<string | null>(null)
  const editingQueueContent = ref('')

  function startEditQueueItem(item: QueuedMessage) {
    editingQueueId.value = item.id
    editingQueueContent.value = item.content
    nextTick(() => {
      const el = document.getElementById(`queue-edit-${item.id}`)
      if (el)
        el.focus()
    })
  }

  function saveEditQueueItem(id: string) {
    const trimmed = editingQueueContent.value.trim()
    if (trimmed) {
      editQueueItem(id, trimmed)
    }
    else {
      removeFromQueue(id)
    }
    editingQueueId.value = null
    editingQueueContent.value = ''
  }

  function cancelEditQueueItem() {
    editingQueueId.value = null
    editingQueueContent.value = ''
  }

  function handleQueueEditKeydown(event: KeyboardEvent, id: string) {
    if (event.isComposing)
      return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      saveEditQueueItem(id)
    }
    else if (event.key === 'Escape') {
      cancelEditQueueItem()
    }
  }

  return {
    editingQueueId,
    editingQueueContent,
    startEditQueueItem,
    saveEditQueueItem,
    handleQueueEditKeydown,
  }
}
