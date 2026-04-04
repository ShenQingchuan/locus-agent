import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { DropdownItem } from '@univedge/locus-ui'
import type { EmitFn } from 'vue'
import type PromptEditor from '@/components/chat/prompt-editor/PromptEditor.vue'
import type { QueuedMessage } from '@/composables/useAssistantRuntime'
import { ACP_CODING_PROVIDERS, getCodingProviderForParent, isACPCodingProvider } from '@univedge/locus-agent-sdk'
import { useToast } from '@univedge/locus-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useEscConfirm } from '@/composables/useEscConfirm'
import { useImageAttachments } from '@/composables/useImageAttachments'
import { useModelSelector } from '@/composables/useModelSelector'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'

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
  const toast = useToast()
  const markDirty = useMarkConversationDirty()

  const promptEditorRef = ref<InstanceType<typeof PromptEditor> | null>(null)
  const editorText = ref('')
  const whitelistOpen = ref(false)

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

  const {
    providerOptions,
    isCustomProvider,
    customModeOptions,
    localModel,
    modelPlaceholder,
    modelInputWidth,
    handleProviderChange,
    handleCustomModeChange,
    handleModelInput,
  } = useModelSelector()

  const activeACPExecutor = computed(() =>
    modelSettings.codingExecutor && isACPCodingProvider(modelSettings.codingExecutor)
      ? ACP_CODING_PROVIDERS.find(p => p.value === modelSettings.codingExecutor)
      : undefined,
  )

  const codingExecutorSelectValue = computed(() => {
    if (props.showCodingMode && activeACPExecutor.value)
      return `acp:${activeACPExecutor.value.value}`
    return modelSettings.provider
  })

  const codingProviderOptions = computed(() => {
    if (!props.showCodingMode)
      return providerOptions

    return [
      ...providerOptions.map((option, index) => ({
        ...option,
        groupLabel: index === 0 ? '模型提供商' : undefined,
      })),
      ...ACP_CODING_PROVIDERS.map((provider, index) => ({
        value: `acp:${provider.value}`,
        label: provider.label,
        icon: provider.icon,
        separator: index === 0,
        groupLabel: index === 0 ? 'ACP' : undefined,
      })),
    ]
  })

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
      chatStore.editQueueItem(id, trimmed)
    }
    else {
      chatStore.removeFromQueue(id)
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

  const modeItems = computed<DropdownItem[]>(() => {
    const items: DropdownItem[] = [
      {
        key: 'think',
        label: '思考模式',
        icon: 'i-ri:brain-line',
        active: modelSettings.thinkMode,
      },
      {
        key: 'yolo',
        label: '自由执行',
        icon: 'i-ic:sharp-cruelty-free',
        active: chatStore.yoloMode,
      },
    ]

    const codingMeta = props.showCodingMode ? getCodingProviderForParent(modelSettings.provider) : undefined
    if (codingMeta) {
      items.push({
        key: `coding-executor:${codingMeta.value}`,
        label: `${codingMeta.label} 编码`,
        icon: codingMeta.parentProvider === 'openai' ? 'i-simple-icons:openai' : 'i-custom:moonshot',
        active: modelSettings.codingExecutor === codingMeta.value,
        separator: true,
      })
    }

    items.push({
      key: 'whitelist',
      label: '工具白名单',
      icon: 'i-carbon-tool-box',
      separator: !codingMeta,
    })

    return items
  })

  const currentPlanItems = computed<DropdownItem[]>(() => {
    if (!chatStore.activeBoundPlanFilename) {
      return [{ key: 'plan:empty', label: '当前暂无计划', disabled: true }]
    }

    return [
      { key: 'plan:open', label: '打开当前计划', icon: 'i-lucide:notebook-pen' },
      { key: 'plan:unbind', label: '解绑计划', icon: 'i-carbon:unlink', separator: true },
    ]
  })

  const codingModeItems = computed<DropdownItem[]>(() => [
    {
      key: 'coding:build',
      label: 'Build',
      icon: 'i-streamline-sharp:loop-1-solid',
    },
    {
      key: 'coding:plan',
      label: 'Plan',
      icon: 'i-icon-park-solid:guide-board',
    },
    {
      key: 'coding:hint',
      label: 'Shift + Tab 切换模式',
      icon: 'i-carbon-keyboard',
      separator: true,
      disabled: true,
    },
  ])

  const codingModeButtonClass = computed(() => {
    if (chatStore.codingMode === 'build') {
      return 'border border-blue-300/70 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/35'
    }
    return 'border border-amber-300/70 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/35'
  })

  const currentCodingModeItem = computed(() => {
    const key = chatStore.codingMode === 'build' ? 'coding:build' : 'coding:plan'
    return codingModeItems.value.find(item => item.key === key)
  })

  const codingModeButtonIcon = computed(() => currentCodingModeItem.value?.icon ?? 'i-carbon:code')
  const codingModeButtonLabel = computed(() => currentCodingModeItem.value?.label ?? (chatStore.codingMode === 'build' ? 'Build' : 'Plan'))

  function handleModeSelect(key: string) {
    if (key === 'think') {
      modelSettings.toggleThinkMode()
    }
    else if (key === 'yolo') {
      chatStore.toggleYoloMode()
    }
    else if (key === 'whitelist') {
      whitelistOpen.value = !whitelistOpen.value
    }
    else if (key.startsWith('coding-executor:')) {
      const provider = key.replace('coding-executor:', '')
      modelSettings.codingExecutor = modelSettings.codingExecutor === provider ? null : provider as typeof modelSettings.codingExecutor
    }
  }

  async function handleCodingExecutorSelect(value: string) {
    if (!props.showCodingMode || !value.startsWith('acp:')) {
      modelSettings.codingExecutor = getCodingProviderForParent(modelSettings.provider)?.value ?? null
      await handleProviderChange(value)
      return
    }

    const provider = value.replace('acp:', '')
    modelSettings.codingExecutor = provider as typeof modelSettings.codingExecutor
  }

  function handleCurrentPlanSelect(key: string) {
    if (key === 'plan:empty')
      return
    if (key === 'plan:unbind') {
      chatStore.unbindPlan()
      return
    }
    if (key === 'plan:open') {
      const opened = chatStore.openCurrentPlan()
      if (!opened) {
        toast.info('当前会话暂无可打开的计划')
      }
    }
  }

  function handleCodingModeSelect(key: string) {
    if (key === 'coding:build')
      chatStore.setCodingMode('build')
    else if (key === 'coding:plan')
      chatStore.setCodingMode('plan')
  }

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

  async function handleSubmit() {
    if (!hasComposerContent.value)
      return

    if (isEditing.value) {
      const editContent = editorText.value
      const editAttachments = [...selectedAttachments.value]
      const editMessageId = chatStore.editingMessageId!
      promptEditorRef.value?.clear()
      resetComposerAttachments()
      const conversationId = await chatStore.saveEditMessage(editMessageId, editContent, editAttachments)
      if (conversationId) {
        markDirty(conversationId)
      }
      return
    }

    emit('send', { content: editorText.value, attachments: [...selectedAttachments.value] })
    promptEditorRef.value?.clear()
    resetComposerAttachments()
  }

  function handleCancelEdit() {
    chatStore.cancelEditMessage()
    promptEditorRef.value?.clear()
    resetComposerAttachments()
  }

  function handleStop() {
    clearEscConfirm()
    emit('stop')
  }

  function handleEscape() {
    if (isEditing.value) {
      handleCancelEdit()
      return
    }

    if (props.isStreaming) {
      if (escConfirmActive.value) {
        handleStop()
        return
      }
      startEscConfirm()
    }
  }

  function handleShiftTab() {
    if (props.showCodingMode) {
      chatStore.toggleCodingMode()
    }
  }

  return {
    chatStore,
    modelSettings,
    promptEditorRef,
    editorText,
    whitelistOpen,
    fileInput,
    selectedAttachments,
    attachmentStripItems,
    removeAttachment,
    handleImageFilesSelected,
    openFilePicker,
    escConfirmActive,
    escRemainingMs,
    escProgressWidth,
    isCustomProvider,
    customModeOptions,
    localModel,
    modelPlaceholder,
    modelInputWidth,
    handleModelInput,
    handleCustomModeChange,
    activeACPExecutor,
    codingExecutorSelectValue,
    codingProviderOptions,
    isEditing,
    hasComposerContent,
    dynamicPlaceholder,
    editingQueueId,
    editingQueueContent,
    startEditQueueItem,
    saveEditQueueItem,
    handleQueueEditKeydown,
    modeItems,
    currentPlanItems,
    codingModeItems,
    codingModeButtonClass,
    codingModeButtonIcon,
    codingModeButtonLabel,
    handleModeSelect,
    handleCodingExecutorSelect,
    handleCurrentPlanSelect,
    handleCodingModeSelect,
    handleSubmit,
    handleCancelEdit,
    handleStop,
    handleEscape,
    handleShiftTab,
  }
}
