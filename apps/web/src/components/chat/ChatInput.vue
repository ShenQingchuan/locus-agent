<script setup lang="ts">
import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'
import type { DropdownItem } from '@locus-agent/ui'
import type { QueuedMessage } from '@/composables/useAssistantRuntime'
import { DEFAULT_MODELS, LLM_PROVIDERS, normalizeModelForProvider } from '@locus-agent/shared'
import { Dropdown, Select, useToast } from '@locus-agent/ui'
import { useDebounceFn, useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useChatStore } from '@/stores/chat'
import ContextUsageRing from './ContextUsageRing.vue'
import SessionWhitelistPopover from './SessionWhitelistPopover.vue'

defineProps<{
  disabled?: boolean
  isStreaming?: boolean
  showBottomHint?: boolean
  disabledPlaceholder?: string
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const chatStore = useChatStore()
const toast = useToast()
const markDirty = useMarkConversationDirty()

const { textarea, input } = useTextareaAutosize()
const whitelistOpen = ref(false)

const isEditing = computed(() => chatStore.editingMessageId !== null)

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

const modeItems = computed<DropdownItem[]>(() => [
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
  {
    key: 'whitelist',
    label: '工具白名单',
    icon: 'i-carbon-tool-box',
    separator: true,
  },
])

function handleModeSelect(key: string) {
  if (key === 'think')
    chatStore.toggleThinkMode()
  else if (key === 'yolo')
    chatStore.toggleYoloMode()
  else if (key === 'whitelist')
    whitelistOpen.value = !whitelistOpen.value
}

const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.value, label: p.label, icon: p.icon }))

const isCustomProvider = computed(() => chatStore.provider === 'custom')

// 兼容模式选项
const customModeOptions = [
  { value: 'openai-compatible' as CustomProviderMode, label: 'OpenAI', icon: 'i-simple-icons:openai' },
  { value: 'anthropic-compatible' as CustomProviderMode, label: 'Anthropic', icon: 'i-simple-icons:anthropic' },
]

const localModel = ref('')

// Remember custom model names per provider so switching away and back preserves the value
const customModelPerProvider = ref<Partial<Record<LLMProviderType, string>>>({})

watch(() => chatStore.modelName, (v) => {
  const normalized = normalizeModelForProvider(v ?? '', chatStore.provider)
  localModel.value = normalized
  // Seed the per-provider cache with the normalized value
  if (normalized) {
    customModelPerProvider.value[chatStore.provider] = normalized
  }
}, { immediate: true })

/**
 * DeepSeek 默认模型根据 thinkMode 动态切换
 * -chat 无推理，-reasoner 带思考
 * 用户未填写时（使用 placeholder），显示对应的默认模型
 */
const modelPlaceholder = computed(() => {
  if (chatStore.provider !== 'deepseek')
    return DEFAULT_MODELS[chatStore.provider] ?? ''

  // DeepSeek 根据思考模式返回不同的默认模型
  return chatStore.thinkMode ? 'deepseek-reasoner' : 'deepseek-chat'
})

// Auto-width: use the visible text (value or placeholder) to size the input in ch units
const modelInputWidth = computed(() => {
  const text = localModel.value || modelPlaceholder.value
  // +1ch gives a little breathing room so the cursor doesn't feel cramped
  return `${Math.max(3, text.length) + 1}ch`
})

const debouncedSaveModel = useDebounceFn(async () => {
  const result = await chatStore.saveModelSettings(
    chatStore.provider,
    localModel.value.trim(),
    isCustomProvider.value ? chatStore.customMode : undefined,
  )
  if (!result.success)
    toast.error(result.message || '保存模型设置失败')
}, 800)

async function handleProviderChange(value: string) {
  const p = value as LLMProviderType
  // Save current model for the old provider before switching
  if (localModel.value.trim()) {
    customModelPerProvider.value[chatStore.provider] = localModel.value.trim()
  }
  // Restore previously remembered model for the new provider (or empty)
  // Normalize: e.g. moonshotai/kimi-k2.5 -> kimi-k2.5 when switching to moonshotai
  const remembered = normalizeModelForProvider(customModelPerProvider.value[p] ?? '', p)
  localModel.value = remembered
  // 自定义提供商时，使用当前 customMode
  const result = await chatStore.saveModelSettings(
    p,
    remembered,
    p === 'custom' ? chatStore.customMode : undefined,
  )
  if (!result.success) {
    toast.error(result.message || '切换提供商失败')
  }
}

async function handleCustomModeChange(value: string) {
  const mode = value as CustomProviderMode
  const result = await chatStore.saveModelSettings(chatStore.provider, localModel.value.trim(), mode)
  if (!result.success) {
    toast.error(result.message || '切换兼容模式失败')
  }
}

function handleModelInput() {
  // Keep per-provider cache in sync as user types
  customModelPerProvider.value[chatStore.provider] = localModel.value.trim()
  debouncedSaveModel()
}

// Reset height when input is cleared
watch(input, (newValue) => {
  if (!newValue && textarea.value) {
    textarea.value.style.height = 'auto'
  }
})

// When entering edit mode, populate the input with the editing content
watch(() => chatStore.editingMessageId, async (newId) => {
  if (newId) {
    input.value = chatStore.editingContent
    await nextTick()
    textarea.value?.focus()
  }
})

// When new conversation is created, focus the prompt input
watch(() => chatStore.focusInputTrigger, async () => {
  await nextTick()
  textarea.value?.focus()
})

async function handleSubmit() {
  if (!input.value.trim())
    return

  if (isEditing.value) {
    // Edit mode: save the edited message and re-send
    const conversationId = await chatStore.saveEditMessage(chatStore.editingMessageId!, input.value)
    if (conversationId) {
      markDirty(conversationId)
    }
    input.value = ''
    return
  }

  // 允许在 streaming 期间发送（消息会进入队列）
  emit('send', input.value)
  input.value = ''
}

function handleCancelEdit() {
  chatStore.cancelEditMessage()
  input.value = ''
}

function handleStop() {
  emit('stop')
}

function handleKeydown(event: KeyboardEvent) {
  // 输入法组合输入时不触发发送
  if (event.isComposing)
    return

  if (event.key === 'Escape' && isEditing.value) {
    handleCancelEdit()
    return
  }

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
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
          class="mb-0.5 flex items-start gap-1.5 rounded px-1.5 py-1 last:mb-0 hover:bg-muted/50"
        >
          <div
            class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
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
      <!-- Queue panel: shows pending messages above the textarea -->
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
            <span class="flex-1 text-xs text-foreground/80 truncate">{{ item.content }}</span>
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

      <!-- Textarea -->
      <textarea
        ref="textarea"
        v-model="input"
        class="w-full resize-none bg-transparent px-4 pt-4 min-h-[80px] pb-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        :placeholder="disabled && disabledPlaceholder
          ? disabledPlaceholder
          : isEditing
            ? '编辑消息…'
            : isStreaming
              ? '输入消息（将在当前回答结束后发送）…'
              : '输入消息…'"
        rows="1"
        :disabled="disabled"
        @keydown="handleKeydown"
      />

      <!-- Bottom toolbar -->
      <div class="flex items-center justify-between px-3 py-2">
        <div class="flex items-center gap-1.5">
          <!-- Mode selector dropdown -->
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
          <!-- Session whitelist popover (triggered from dropdown menu) -->
          <div v-if="whitelistOpen" class="absolute left-0 bottom-full mb-1 z-[999]">
            <SessionWhitelistPopover @close="whitelistOpen = false" />
          </div>

          <span class="text-muted-foreground/25 text-xs flex-shrink-0">|</span>

          <!-- Provider + model inline -->
          <Select
            :options="providerOptions"
            :model-value="chatStore.provider"
            placement="top-start"
            size="sm"
            arrow-direction="up"
            @update:model-value="handleProviderChange"
          />

          <!-- 自定义提供商兼容模式选择 -->
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

          <span class="text-muted-foreground/30 text-xs flex-shrink-0">/</span>
          <input
            id="model-name-input"
            v-model="localModel"
            class="bg-transparent border-b border-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/40 focus:border-border focus:text-foreground focus:outline-none transition-colors duration-150 py-0.5 font-mono min-w-0"
            :style="{ width: modelInputWidth }"
            type="text"
            :placeholder="modelPlaceholder"
            spellcheck="false"
            autocomplete="off"
            @input="handleModelInput"
          >
          <div v-if="chatStore.isSavingModelSettings" class="i-carbon-circle-dash h-3 w-3 animate-spin text-muted-foreground/40 flex-shrink-0" />
        </div>

        <!-- Send/stop button -->
        <div class="flex items-center gap-4">
          <!-- Context usage ring -->
          <ContextUsageRing
            :used="chatStore.contextTokensUsed"
            :total="chatStore.MAX_CONTEXT_TOKENS"
          />
          <!-- Cancel edit button -->
          <button
            v-if="isEditing"
            class="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
            title="取消编辑"
            @click="handleCancelEdit"
          >
            <div class="i-carbon-close h-3.5 w-3.5" />
            <span>取消编辑</span>
          </button>

          <!-- Stop button: shown during streaming -->
          <button
            v-if="isStreaming"
            class="flex items-center justify-center h-8 w-8 rounded-lg bg-destructive/90 text-destructive-foreground hover:bg-destructive transition-colors duration-150"
            title="停止生成"
            @click="handleStop"
          >
            <div class="i-carbon-stop-filled h-4 w-4" />
          </button>

          <!-- Send button: always visible, enabled when there's text to send -->
          <button
            class="flex items-center justify-center h-8 w-8 rounded-lg transition-colors duration-150"
            :class="[
              input.trim() && !disabled
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            ]"
            :disabled="!input.trim() || disabled"
            :title="isEditing ? '保存并发送' : isStreaming ? '排队发送' : '发送消息'"
            @click="handleSubmit"
          >
            <div class="i-material-symbols:send-rounded h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
