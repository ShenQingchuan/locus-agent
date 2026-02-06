<script setup lang="ts">
import type { Message } from '@/stores/chat'
import { useScroll } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import MessageBubble from './MessageBubble.vue'

const props = defineProps<{
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
}>()

const containerRef = ref<HTMLElement | null>(null)
const { y, arrivedState } = useScroll(containerRef, { behavior: 'smooth' })

// Track if user has manually scrolled up
const userScrolledUp = ref(false)
const lastScrollTop = ref(0)

// Watch for scroll position to detect manual scrolling
watch(() => y.value, (currentY) => {
  if (containerRef.value) {
    const scrollTop = currentY
    const scrollHeight = containerRef.value.scrollHeight
    const clientHeight = containerRef.value.clientHeight
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    if (scrollTop < lastScrollTop.value && !isAtBottom) {
      userScrolledUp.value = true
    }
    else if (isAtBottom) {
      userScrolledUp.value = false
    }

    lastScrollTop.value = scrollTop
  }
})

// Auto-scroll to bottom when new messages arrive or content updates
watch(
  () => [props.messages.length, props.messages[props.messages.length - 1]?.content],
  async () => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (!userScrolledUp.value || props.isStreaming) {
      await nextTick()
      scrollToBottom()
    }
  },
  { deep: true },
)

function scrollToBottom() {
  if (containerRef.value) {
    y.value = containerRef.value.scrollHeight
  }
}

// Expose scroll to bottom for external use
defineExpose({ scrollToBottom })
</script>

<template>
  <div class="relative h-full">
    <div
      ref="containerRef"
      class="h-full overflow-y-auto px-4 py-4 bg-background"
    >
      <div class="max-w-3xl mx-auto">
        <!-- Empty state -->
        <div
          v-if="messages.length === 0"
          class="flex-col-center h-full py-20 text-muted-foreground"
        >
          <div class="i-carbon-chat-bot h-10 w-10 mb-4 opacity-50" />
          <p class="text-base font-medium">
            开始对话
          </p>
          <p class="text-sm mt-1.5 opacity-70">
            在下方输入消息开始聊天
          </p>
        </div>

        <!-- Messages -->
        <div class="space-y-1">
          <MessageBubble
            v-for="message in messages"
            :key="message.id"
            :message="message"
          />
        </div>

        <!-- Typing indicator -->
        <div
          v-if="isLoading && !isStreaming"
          class="py-2 flex items-center gap-2 text-muted-foreground"
        >
          <div class="flex items-center gap-1">
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/70"
              style="animation-delay: 0ms"
            />
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/70"
              style="animation-delay: 150ms"
            />
            <div
              class="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/70"
              style="animation-delay: 300ms"
            />
          </div>
          <span class="text-sm">思考中...</span>
        </div>
      </div>
    </div>

    <!-- Scroll to bottom button -->
    <div class="absolute inset-0 pointer-events-none">
      <div class="max-w-3xl mx-auto relative h-full">
        <Transition name="fade">
          <button
            v-if="!arrivedState.bottom && messages.length > 0"
            class="pointer-events-auto absolute bottom-3 -right-14 z-50 h-9 w-9 rounded-full border border-border bg-background text-foreground shadow-md flex items-center justify-center hover:bg-muted transition-all duration-200"
            title="滚动到底部"
            @click="scrollToBottom(); userScrolledUp = false"
          >
            <div class="i-carbon-arrow-down h-4 w-4" />
          </button>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 150ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
