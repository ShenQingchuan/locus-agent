import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { EmitFn, Ref } from 'vue'
import type PromptEditor from '@/components/chat/prompt-editor/PromptEditor.vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useChatStore } from '@/stores/chat'

export interface ChatInputSubmitDeps {
  promptEditorRef: Ref<InstanceType<typeof PromptEditor> | null>
  editorText: Ref<string>
  selectedAttachments: Ref<MessageImageAttachment[]>
  isStreaming: boolean
  showCodingMode: boolean | undefined
  resetComposerAttachments: () => void
  clearEscConfirm: () => void
  startEscConfirm: () => void
  escConfirmActive: Ref<boolean>
}

export function useChatInputSubmit(
  deps: ChatInputSubmitDeps,
  emit: EmitFn<{ send: [payload: { content: string, attachments: MessageImageAttachment[] }], stop: [] }>,
) {
  const chatStore = useChatStore()
  const markDirty = useMarkConversationDirty()

  const { promptEditorRef, editorText, selectedAttachments, isStreaming, showCodingMode } = deps

  function isEditing() {
    return chatStore.editingMessageId !== null
  }

  function hasComposerContent() {
    return editorText.value.trim().length > 0 || selectedAttachments.value.length > 0
  }

  async function handleSubmit() {
    if (!hasComposerContent())
      return

    if (isEditing()) {
      const editContent = editorText.value
      const editAttachments = [...selectedAttachments.value]
      const editMessageId = chatStore.editingMessageId!
      promptEditorRef.value?.clear()
      deps.resetComposerAttachments()
      const conversationId = await chatStore.saveEditMessage(editMessageId, editContent, editAttachments)
      if (conversationId) {
        markDirty(conversationId)
      }
      return
    }

    emit('send', { content: editorText.value, attachments: [...selectedAttachments.value] })
    promptEditorRef.value?.clear()
    deps.resetComposerAttachments()
  }

  function handleCancelEdit() {
    chatStore.cancelEditMessage()
    promptEditorRef.value?.clear()
    deps.resetComposerAttachments()
  }

  function handleStop() {
    deps.clearEscConfirm()
    emit('stop')
  }

  function handleEscape() {
    if (isEditing()) {
      handleCancelEdit()
      return
    }

    if (isStreaming) {
      if (deps.escConfirmActive.value) {
        handleStop()
        return
      }
      deps.startEscConfirm()
    }
  }

  function handleShiftTab() {
    if (showCodingMode) {
      chatStore.toggleCodingMode()
    }
  }

  return {
    isEditing,
    hasComposerContent,
    handleSubmit,
    handleCancelEdit,
    handleStop,
    handleEscape,
    handleShiftTab,
  }
}
