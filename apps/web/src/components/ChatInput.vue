<script setup lang="ts">
import { useTextareaAutosize } from '@vueuse/core'
import { watch } from 'vue'
import { useChatStore } from '@/stores/chat'

defineProps<{
  disabled?: boolean
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  stop: []
}>()

const chatStore = useChatStore()

const { textarea, input } = useTextareaAutosize()

// Reset height when input is cleared
watch(input, (newValue) => {
  if (!newValue && textarea.value) {
    textarea.value.style.height = 'auto'
  }
})

function handleSubmit() {
  if (!input.value.trim())
    return

  emit('send', input.value)
  input.value = ''
}

function handleStop() {
  emit('stop')
}

function handleKeydown(event: KeyboardEvent) {
  // 输入法组合输入时不触发发送
  if (event.isComposing)
    return

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}
</script>

<template>
  <div class="w-full max-w-3xl mx-auto">
    <div
      class="relative flex flex-col rounded border border-border bg-muted/30 transition-colors duration-150 focus-within:border-border/80 focus-within:bg-muted/50 overflow-hidden"
    >
      <!-- Textarea -->
      <textarea
        ref="textarea"
        v-model="input"
        class="w-full resize-none bg-transparent px-4 pt-4 min-h-[80px] pb-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        placeholder="输入消息..."
        rows="1"
        :disabled="disabled"
        @keydown="handleKeydown"
      />

      <!-- Bottom toolbar -->
      <div class="flex items-center justify-between px-3 py-2">
        <!-- Yolo mode toggle -->
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors duration-150">
            <input
              type="checkbox"
              :checked="chatStore.yoloMode"
              class="sr-only"
              @change="chatStore.toggleYoloMode()"
            >
            <div
              class="relative h-5 w-9 rounded-full transition-colors duration-150"
              :class="chatStore.yoloMode ? 'bg-primary' : 'bg-muted'"
            >
              <div
                class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform duration-150"
                :class="chatStore.yoloMode ? 'translate-x-4' : 'translate-x-0'"
              />
            </div>
            <span>Yolo 模式</span>
          </label>

          <label class="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors duration-150">
            <input
              type="checkbox"
              :checked="chatStore.thinkMode"
              class="sr-only"
              @change="chatStore.toggleThinkMode()"
            >
            <div
              class="relative h-5 w-9 rounded-full transition-colors duration-150"
              :class="chatStore.thinkMode ? 'bg-primary' : 'bg-muted'"
            >
              <div
                class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform duration-150"
                :class="chatStore.thinkMode ? 'translate-x-4' : 'translate-x-0'"
              />
            </div>
            <span>Think 模式</span>
          </label>
        </div>

        <!-- Send/stop button -->
        <div class="flex items-center">
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
            title="发送消息"
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
