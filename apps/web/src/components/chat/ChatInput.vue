<script setup lang="ts">
import type { MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { DropdownItem } from '@univedge/locus-ui'
import type { QueuedMessage } from '@/composables/useAssistantRuntime'
import { getCodingProviderForParent } from '@univedge/locus-agent-sdk'
import { Dropdown, ImageAttachmentStrip, Select, useToast } from '@univedge/locus-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useEscConfirm } from '@/composables/useEscConfirm'
import { useImageAttachments } from '@/composables/useImageAttachments'
import { useModelSelector } from '@/composables/useModelSelector'
import { useChatStore } from '@/stores/chat'
import ContextUsageRing from './ContextUsageRing.vue'
import PromptEditor from './prompt-editor/PromptEditor.vue'
import SessionWhitelistPopover from './SessionWhitelistPopover.vue'

const props = defineProps<{
  disabled?: boolean
  isStreaming?: boolean
  showBottomHint?: boolean
  disabledPlaceholder?: string
  /** 是否显示 Build/Plan 模式切换（仅 Coding 空间使用） */
  showCodingMode?: boolean
  /** 工作空间根路径（用于加载项目级 skills 等） */
  workspaceRoot?: string
}>()

const emit = defineEmits<{
  send: [payload: { content: string, attachments: MessageImageAttachment[] }]
  stop: []
}>()

const chatStore = useChatStore()
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

// Queue item inline editing
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
      active: chatStore.thinkMode,
    },
    {
      key: 'yolo',
      label: '自由执行',
      icon: 'i-ic:sharp-cruelty-free',
      active: chatStore.yoloMode,
    },
  ]

  // Only show the coding provider toggle in coding space
  const codingMeta = props.showCodingMode ? getCodingProviderForParent(chatStore.provider) : undefined
  if (codingMeta) {
    items.push({
      key: `coding-provider:${codingMeta.value}`,
      label: `${codingMeta.label} 编码`,
      icon: codingMeta.parentProvider === 'openai' ? 'i-simple-icons:openai' : 'i-custom:moonshot',
      active: chatStore.codingProvider === codingMeta.value,
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
    chatStore.toggleThinkMode()
  }
  else if (key === 'yolo') {
    chatStore.toggleYoloMode()
  }
  else if (key === 'whitelist') {
    whitelistOpen.value = !whitelistOpen.value
  }
  else if (key.startsWith('coding-provider:')) {
    const provider = key.replace('coding-provider:', '') as 'kimi-code'
    chatStore.codingProvider = chatStore.codingProvider === provider ? null : provider
  }
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

// When entering edit mode, populate the input with the editing content
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

// When new conversation is created, focus the prompt input
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

  // 允许在 streaming 期间发送（消息会进入队列）
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
</script>

<template>
  <div class="w-full max-w-3xl mx-auto">
    <div
      v-if="chatStore.todoTasks.length > 0"
      class="mb-2 overflow-hidden rounded-md border border-border bg-background"
    >
      <div class="flex items-center justify-between border-b border-border px-2.5 py-1.5">
        <div class="flex items-center gap-2 text-sm text-foreground">
          <div class="i-octicon:tasklist-16 h-4 w-4 text-foreground/70" />
          <span class="font-medium">当前待办</span>
          <span class="text-xs text-muted-foreground">{{ chatStore.todoTasks.length }} 项</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="text-muted-foreground">
            已完成 {{ chatStore.completedTodoCount }}
          </span>
          <span class="text-muted-foreground">
            进行中 {{ chatStore.inProgressTodoCount }}
          </span>
        </div>
      </div>

      <div class="max-h-36 overflow-y-auto px-1.5 py-1.5">
        <div
          v-for="task in chatStore.todoTasks"
          :key="task.id"
          class="mb-0.5 flex items-center gap-1.5 rounded px-1.5 py-1 last:mb-0 hover:bg-muted/50"
        >
          <div
            class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
            :class="task.status === 'completed' ? 'i-lets-icons:done-ring-round' : 'i-icon-park-outline:hourglass-full'"
          />
          <span
            class="flex-1 text-[13px] leading-5"
            :class="task.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'"
          >
            {{ task.content }}
          </span>
          <span class="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
            {{ task.status === 'completed' ? '已完成' : '进行中' }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="relative flex flex-col rounded border border-border bg-muted/30 transition-colors duration-150 focus-within:border-border/80 focus-within:bg-muted/50"
    >
      <!-- Queue panel: shows pending messages above the editor -->
      <div
        v-if="chatStore.messageQueue.length > 0"
        class="flex flex-col gap-1 px-3 pt-3 pb-1 border-b border-border/40"
      >
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <div class="i-bx:bxs-hourglass h-3.5 w-3.5 text-primary" />
          <span>{{ chatStore.messageQueue.length }} 条消息排队中</span>
        </div>
        <div
          v-for="item in chatStore.messageQueue"
          :key="item.id"
          class="flex items-center gap-2 group rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <!-- Inline edit mode -->
          <template v-if="editingQueueId === item.id">
            <input
              :id="`queue-edit-${item.id}`"
              v-model="editingQueueContent"
              class="flex-1 bg-transparent text-xs text-foreground outline-none border-b border-primary/50 py-0.5"
              @keydown="handleQueueEditKeydown($event, item.id)"
              @blur="saveEditQueueItem(item.id)"
            >
          </template>
          <!-- Display mode -->
          <template v-else>
            <span class="flex-1 text-xs text-foreground/80 truncate">
              {{ item.content || '图片消息' }}
              <span v-if="item.attachments?.length" class="text-muted-foreground/70">
                · {{ item.attachments.length }} 张图片
              </span>
            </span>
            <button
              class="flex-shrink-0 flex items-center justify-center h-4.5 w-4.5 rounded text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all duration-150"
              title="编辑此消息"
              @click="startEditQueueItem(item)"
            >
              <div class="i-carbon-edit h-3 w-3" />
            </button>
            <button
              class="flex-shrink-0 flex items-center justify-center h-4.5 w-4.5 rounded text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
              title="移除此消息"
              @click="chatStore.removeFromQueue(item.id)"
            >
              <div class="i-carbon-close h-3 w-3" />
            </button>
          </template>
        </div>
      </div>

      <!-- ESC confirm banner -->
      <div
        v-if="escConfirmActive && isStreaming"
        class="mx-3 mt-2 mb-1 rounded-full border border-amber-300/50 bg-amber-500/10 px-3 py-1"
      >
        <div class="flex items-center justify-between gap-3 text-[11px] text-amber-800 dark:text-amber-200">
          <span>3秒内再次点击 ESC 中断对话</span>
          <span class="font-mono">{{ Math.ceil(escRemainingMs / 1000) }}s</span>
        </div>
        <div class="mt-1 h-1.5 rounded-full bg-amber-400/20 overflow-hidden">
          <div
            class="h-full bg-amber-500/70 transition-[width] duration-75"
            :style="{ width: escProgressWidth }"
          />
        </div>
      </div>

      <div v-if="selectedAttachments.length > 0" class="px-3 pt-3 pb-1">
        <div class="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <div class="i-carbon:image-copy h-3.5 w-3.5" />
          <span>已附带 {{ selectedAttachments.length }} 张图片</span>
        </div>
        <ImageAttachmentStrip
          :images="attachmentStripItems"
          size="sm"
          removable
          @remove="removeAttachment"
        />
      </div>

      <!-- Prompt Editor (replaces textarea) -->
      <PromptEditor
        ref="promptEditorRef"
        v-model="editorText"
        :placeholder="dynamicPlaceholder"
        :disabled="disabled"
        :workspace-root="workspaceRoot"
        @submit="handleSubmit"
        @escape="handleEscape"
        @shift-tab="handleShiftTab"
      />

      <!-- Build/Plan mode toggle row (Coding 空间独有) -->
      <div v-if="showCodingMode" class="flex items-center justify-between px-3 pt-1.5 gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Dropdown :items="codingModeItems" placement="top-start" persistent trigger="hover" @select="handleCodingModeSelect">
            <template #trigger>
              <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors duration-150"
                :class="codingModeButtonClass"
                aria-label="选择编码模式"
              >
                <div class="h-3.5 w-3.5" :class="codingModeButtonIcon" />
                <span class="font-medium">{{ codingModeButtonLabel }}</span>
                <div class="i-carbon-chevron-up h-3 w-3 opacity-70" />
              </button>
            </template>
          </Dropdown>

          <Dropdown
            v-if="chatStore.codingMode === 'build'"
            :items="currentPlanItems"
            placement="top-start"
            persistent
            trigger="hover"
            @select="handleCurrentPlanSelect"
          >
            <template #trigger>
              <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              >
                <div class="i-icon-park-solid:guide-board h-3.5 w-3.5" />
                <span>关联计划</span>
                <div
                  v-if="chatStore.isLoadingPlan"
                  class="i-carbon-circle-dash h-3 w-3 animate-spin opacity-60"
                />
                <div v-else class="i-carbon-chevron-up h-3 w-3 opacity-50" />
              </button>
            </template>
          </Dropdown>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button
            class="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
            type="button"
            title="上传图片"
            :disabled="disabled"
            @click="openFilePicker"
          >
            <div class="i-carbon-image-search h-3.5 w-3.5" />
            <span>图片</span>
          </button>

          <Dropdown :items="modeItems" placement="top-end" persistent @select="handleModeSelect">
            <template #trigger>
              <button
                class="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 flex-shrink-0"
                aria-label="切换模式"
              >
                <div class="i-carbon-settings-adjust h-3.5 w-3.5" />
                <span>选项</span>
                <div class="i-carbon-chevron-up h-3 w-3 opacity-50" />
              </button>
            </template>
          </Dropdown>
        </div>
      </div>

      <!-- Bottom toolbar -->
      <div class="px-3 py-2 space-y-2">
        <div class="flex items-center gap-1.5">
          <input
            ref="fileInput"
            class="hidden"
            type="file"
            accept="image/*"
            multiple
            @change="handleImageFilesSelected"
          >
          <button
            v-if="!showCodingMode"
            class="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 flex-shrink-0"
            type="button"
            title="上传图片"
            :disabled="disabled"
            @click="openFilePicker"
          >
            <div class="i-carbon-image-search h-3.5 w-3.5" />
            <span>图片</span>
          </button>

          <!-- Mode selector dropdown (Chat 页面显示，Coding 页面已移到上方) -->
          <template v-if="!showCodingMode">
            <span class="text-muted-foreground/25 text-xs flex-shrink-0">|</span>
            <Dropdown :items="modeItems" placement="top-start" persistent @select="handleModeSelect">
              <template #trigger>
                <button
                  class="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 flex-shrink-0"
                  aria-label="切换模式"
                >
                  <div class="i-carbon-settings-adjust h-3.5 w-3.5" />
                  <span>选项</span>
                  <div class="i-carbon-chevron-up h-3 w-3 opacity-50" />
                </button>
              </template>
            </Dropdown>
          </template>

          <div v-if="whitelistOpen" class="absolute left-0 bottom-full mb-1 z-[999]">
            <SessionWhitelistPopover @close="whitelistOpen = false" />
          </div>
        </div>

        <div class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/55 px-2 py-1.5">
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <Select
              :options="providerOptions"
              :model-value="chatStore.provider"
              placement="top-start"
              size="sm"
              arrow-direction="up"
              @update:model-value="handleProviderChange"
            />

            <template v-if="isCustomProvider">
              <span class="text-muted-foreground/30 text-xs flex-shrink-0">·</span>
              <Select
                :options="customModeOptions"
                :model-value="chatStore.customMode"
                placement="top-start"
                size="sm"
                arrow-direction="up"
                @update:model-value="handleCustomModeChange"
              />
            </template>

            <span class="text-muted-foreground/30 text-xs font-mono flex-shrink-0">/</span>
            <input
              id="model-name-input"
              v-model="localModel"
              class="min-w-[10ch] flex-1 bg-transparent border-b border-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 focus:border-border focus:text-foreground focus:outline-none transition-colors duration-150 py-0.5 font-mono"
              :style="{ width: modelInputWidth }"
              type="text"
              :placeholder="modelPlaceholder"
              spellcheck="false"
              autocomplete="off"
              @input="handleModelInput"
            >
            <div v-if="chatStore.isSavingModelSettings" class="i-carbon-circle-dash h-3 w-3 animate-spin text-muted-foreground/40 flex-shrink-0" />

            <template v-if="showCodingMode && chatStore.codingProvider">
              <span class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
                {{ chatStore.codingProvider }}
              </span>
            </template>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <ContextUsageRing
              :used="chatStore.contextTokensUsed"
              :total="chatStore.MAX_CONTEXT_TOKENS"
            />

            <button
              v-if="isEditing"
              class="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              title="取消编辑"
              @click="handleCancelEdit"
            >
              <div class="i-carbon-close h-3.5 w-3.5" />
              <span>取消编辑</span>
            </button>

            <button
              v-if="isStreaming"
              class="flex items-center justify-center h-8 w-8 rounded-lg bg-destructive/90 text-destructive-foreground hover:bg-destructive transition-colors duration-150"
              title="停止生成"
              @click="handleStop"
            >
              <div class="i-carbon-stop-filled h-4 w-4" />
            </button>

            <button
              class="flex items-center justify-center h-8 w-8 rounded-lg transition-colors duration-150"
              :class="[
                hasComposerContent && !disabled
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              ]"
              :disabled="!hasComposerContent || disabled"
              :title="isEditing ? '保存并发送' : isStreaming ? '排队发送' : '发送消息'"
              @click="handleSubmit"
            >
              <div class="i-material-symbols:send-rounded h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
