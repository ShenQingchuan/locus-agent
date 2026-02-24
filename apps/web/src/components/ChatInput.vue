<script setup lang="ts">
import type { LLMProviderType } from '@locus-agent/shared'
import type { DropdownItem } from '@locus-agent/ui'
import { DEFAULT_MODELS, LLM_PROVIDERS } from '@locus-agent/shared'
import { Dropdown, Select, useToast } from '@locus-agent/ui'
import { useDebounceFn, useTextareaAutosize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import ContextUsageRing from './ContextUsageRing.vue'
import SessionWhitelistPopover from './SessionWhitelistPopover.vue'

defineProps<{
  disabled?: boolean
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const chatStore = useChatStore()
const toast = useToast()

const { textarea, input } = useTextareaAutosize()
const whitelistOpen = ref(false)

const isEditing = computed(() => chatStore.editingMessageId !== null)

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
])

function handleModeSelect(key: string) {
  if (key === 'think')
    chatStore.toggleThinkMode()
  else if (key === 'yolo')
    chatStore.toggleYoloMode()
}

const providerOptions = LLM_PROVIDERS.map(p => ({ value: p.value, label: p.label, icon: p.icon }))

const localModel = ref('')

// Remember custom model names per provider so switching away and back preserves the value
const customModelPerProvider = ref<Partial<Record<LLMProviderType, string>>>({})

watch(() => chatStore.modelName, (v) => {
  localModel.value = v
  // Seed the per-provider cache with the initial server value
  if (v) {
    customModelPerProvider.value[chatStore.provider] = v
  }
}, { immediate: true })

const modelPlaceholder = computed(() => DEFAULT_MODELS[chatStore.provider] ?? '')

// Auto-width: use the visible text (value or placeholder) to size the input in ch units
const modelInputWidth = computed(() => {
  const text = localModel.value || modelPlaceholder.value
  // +1ch gives a little breathing room so the cursor doesn't feel cramped
  return `${Math.max(3, text.length) + 1}ch`
})

const debouncedSaveModel = useDebounceFn(async () => {
  const result = await chatStore.saveModelSettings(chatStore.provider, localModel.value.trim())
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
  const remembered = customModelPerProvider.value[p] ?? ''
  localModel.value = remembered
  const result = await chatStore.saveModelSettings(p, remembered)
  if (!result.success) {
    toast.error(result.message || '切换提供商失败')
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

function handleSubmit() {
  if (!input.value.trim())
    return

  if (isEditing.value) {
    // Edit mode: save the edited message and re-send
    chatStore.saveEditMessage(chatStore.editingMessageId!, input.value)
    input.value = ''
    return
  }

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
      class="relative flex flex-col rounded border border-border bg-muted/30 transition-colors duration-150 focus-within:border-border/80 focus-within:bg-muted/50"
    >
      <!-- Textarea -->
      <textarea
        ref="textarea"
        v-model="input"
        class="w-full resize-none bg-transparent px-4 pt-4 min-h-[80px] pb-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        :placeholder="isEditing ? '编辑消息…' : '输入消息…'"
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

          <!-- Whitelist button -->
          <div class="relative">
            <button
              class="flex items-center px-2 py-1 text-xs rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 flex-shrink-0"
              @click.stop="whitelistOpen = !whitelistOpen"
            >
              <span>工具白名单</span>
            </button>
            <div v-if="whitelistOpen" class="absolute left-0 bottom-full mb-1 z-[999]">
              <SessionWhitelistPopover @close="whitelistOpen = false" />
            </div>
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

          <button
            v-if="isStreaming"
            class="flex items-center justify-center h-8 w-8 rounded-lg bg-destructive/90 text-destructive-foreground hover:bg-destructive transition-colors duration-150"
            title="停止生成"
            @click="handleStop"
          >
            <div class="i-carbon-stop-filled h-4 w-4" />
          </button>

          <button
            v-else
            class="flex items-center justify-center h-8 w-8 rounded-lg transition-colors duration-150"
            :class="[
              input.trim() && !disabled
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            ]"
            :disabled="!input.trim() || disabled"
            :title="isEditing ? '保存并发送' : '发送消息'"
            @click="handleSubmit"
          >
            <div class="i-material-symbols:send-rounded h-5 w-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Hint text -->
    <p class="text-xs text-muted-foreground/50 text-center mt-2">
      回车发送 · Shift+回车换行
    </p>
  </div>
</template>
