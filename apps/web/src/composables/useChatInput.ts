import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { EmitFn } from 'vue'
import type PromptEditor from '@/components/chat/prompt-editor/PromptEditor.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useEscConfirm } from '@/composables/useEscConfirm'
import { useImageAttachments } from '@/composables/useImageAttachments'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { useChatInputMenus } from './chat-input/useChatInputMenus'
import { useChatInputModel } from './chat-input/useChatInputModel'
import { useChatInputQueue } from './chat-input/useChatInputQueue'
import { useChatInputSubmit } from './chat-input/useChatInputSubmit'

export interface UseChatInputProps {
  disabled?: boolean
  isStreaming?: boolean
  showBottomHint?: boolean
  disabledPlaceholder?: string
  showCodingMode?: boolean
  workspaceRoot?: string
}

export interface ChatInputEmits {
  send: [payload: { content: string, attachments: MessageImageAttachment[] }]
  stop: []
}

export function useChatInput(
  props: UseChatInputProps,
  emit: EmitFn<ChatInputEmits>,
) {
  const chatStore = useChatStore()
  const modelSettings = useModelSettingsStore()
  const promptEditorRef = ref<InstanceType<typeof PromptEditor> | null>(null)
  const editorText = ref('')

  const {
    fileInput,
    selectedAttachments,
    attachmentStripItems,
    resetComposerAttachments,
    removeAttachment,
    handleImageFilesSelected,
    openFilePicker,
  } = useImageAttachments()

  const {
    escConfirmActive,
    escRemainingMs,
    escProgressWidth,
    startEscConfirm,
    clearEscConfirm,
  } = useEscConfirm()

  const model = useChatInputModel(props.showCodingMode)
  const menus = useChatInputMenus()
  const queue = useChatInputQueue(
    chatStore.editQueueItem,
    chatStore.removeFromQueue,
  )

  const isEditing = computed(() => chatStore.editingMessageId !== null)
  const hasComposerContent = computed(() => editorText.value.trim().length > 0 || selectedAttachments.value.length > 0)

  const dynamicPlaceholder = computed(() => {
    if (props.disabled && props.disabledPlaceholder)
      return props.disabledPlaceholder
    if (isEditing.value)
      return '编辑消息…'
    if (props.isStreaming)
      return '输入消息（将在当前回答结束后发送）…'
    return '输入消息…'
  })

  const submit = useChatInputSubmit({
    promptEditorRef,
    editorText,
    selectedAttachments,
    isStreaming: props.isStreaming ?? false,
    showCodingMode: props.showCodingMode,
    resetComposerAttachments,
    clearEscConfirm,
    startEscConfirm,
    escConfirmActive,
  }, emit)

  watch(() => chatStore.editingMessageId, async (newId) => {
    if (newId) {
      promptEditorRef.value?.setText(chatStore.editingContent)
      selectedAttachments.value = [...chatStore.editingAttachments]
      await nextTick()
      promptEditorRef.value?.focus()
    }
    else if (!chatStore.editingContent) {
      resetComposerAttachments()
    }
  })

  watch(() => chatStore.focusInputTrigger, async () => {
    if (!isEditing.value)
      resetComposerAttachments()
    await nextTick()
    promptEditorRef.value?.focus()
  })

  watch(() => chatStore.currentConversationId, () => {
    if (!isEditing.value)
      resetComposerAttachments()
  })

  watch(
    () => [chatStore.currentConversationId, props.showCodingMode] as const,
    ([conversationId, showCoding]) => {
      if (showCoding && conversationId)
        void chatStore.refreshConversationPlans(conversationId)
    },
    { immediate: true },
  )

  watch(() => props.isStreaming, (streaming) => {
    if (!streaming)
      clearEscConfirm()
  })

  return {
    chatStore,
    promptEditorRef,
    editorText,
    whitelistOpen: menus.whitelistOpen,
    fileInput,
    selectedAttachments,
    attachmentStripItems,
    removeAttachment,
    handleImageFilesSelected,
    openFilePicker,
    escConfirmActive,
    escRemainingMs,
    escProgressWidth,
    isCustomProvider: model.isCustomProvider,
    customModeOptions: model.customModeOptions,
    localModel: model.localModel,
    modelPlaceholder: model.modelPlaceholder,
    modelInputWidth: model.modelInputWidth,
    modelSettings,
    handleProviderChange: model.handleProviderChange,
    handleCustomModeChange: model.handleCustomModeChange,
    handleModelInput: model.handleModelInput,
    activeACPExecutor: model.activeACPExecutor,
    codingExecutorSelectValue: model.codingExecutorSelectValue,
    codingProviderOptions: model.codingProviderOptions,
    isEditing,
    hasComposerContent,
    dynamicPlaceholder,
    ...queue,
    modeItems: menus.modeItems,
    currentPlanItems: menus.currentPlanItems,
    codingModeItems: menus.codingModeItems,
    codingModeButtonClass: menus.codingModeButtonClass,
    codingModeButtonIcon: menus.codingModeButtonIcon,
    codingModeButtonLabel: menus.codingModeButtonLabel,
    handleModeSelect: menus.handleModeSelect,
    handleCodingExecutorSelect: model.handleCodingExecutorSelect,
    handleCurrentPlanSelect: menus.handleCurrentPlanSelect,
    handleCodingModeSelect: menus.handleCodingModeSelect,
    handleSubmit: submit.handleSubmit,
    handleCancelEdit: submit.handleCancelEdit,
    handleStop: submit.handleStop,
    handleEscape: submit.handleEscape,
    handleShiftTab: submit.handleShiftTab,
  }
}
