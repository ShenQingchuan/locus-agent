<script setup lang="ts">
import type { Message } from '@/composables/assistant-runtime'
import { provide, ref } from 'vue'
import { chatMessageListScrollRootKey } from '@/composables/chatMessageListContext'
import { useMessageListScroll } from '@/composables/message-list/useMessageListScroll'
import { useMessageListVirtualizer } from '@/composables/message-list/useMessageListVirtualizer'
import MessageBubble from './MessageBubble.vue'

const props = withDefaults(defineProps<{
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  isLoadingConversation?: boolean
  scrollButtonRight?: string
}>(), {
  isLoadingConversation: false,
  scrollButtonRight: 'calc((100% - min(100%, 48rem)) / 2 - 3.5rem)',
})

const containerRef = ref<HTMLElement | null>(null)
const scrollMeasureRef = ref<HTMLElement | null>(null)
/** Shared: scroll composable + Virtualizer resize compensation — stops stream from pulling viewport when user reads up */
const userScrolledUp = ref(false)

provide(chatMessageListScrollRootKey, containerRef)

const { virtualizer } = useMessageListVirtualizer({
  messageCount: () => props.messages.length,
  scrollRoot: containerRef,
  userScrolledUp,
})

const {
  showScrollButton,
  onScroll,
  handleScrollToBottomClick,
  scrollToBottom,
  scrollToToolCall,
} = useMessageListScroll({
  containerRef,
  scrollMeasureRef,
  messages: () => props.messages,
  isStreaming: () => props.isStreaming,
  virtualizer,
  userScrolledUp,
})

defineExpose({ scrollToBottom, scrollToToolCall })
</script>

<template>
  <div class="relative h-full">
    <div
      ref="containerRef"
      class="h-full overflow-y-auto overflow-x-hidden px-4 py-4 bg-background"
      @scroll.passive="onScroll"
    >
      <div ref="scrollMeasureRef" class="max-w-3xl mx-auto">
        <!-- Loading conversation -->
        <div
          v-if="messages.length === 0 && isLoadingConversation"
          class="flex-col-center h-full py-20 text-muted-foreground"
        >
          <div class="i-svg-spinners:bars-scale-fade h-10 w-10 mb-4 opacity-70" />
          <p class="text-base font-medium">
            加载会话中...
          </p>
        </div>

        <!-- Empty state -->
        <div v-else-if="messages.length === 0">
          <slot name="empty">
            <div class="flex-col-center h-full py-20 text-muted-foreground">
              <div class="i-carbon-chat-bot h-10 w-10 mb-4 opacity-50" />
              <p class="text-base font-medium">
                开始对话
              </p>
              <p class="text-sm mt-1.5 opacity-70">
                在下方输入消息开始聊天
              </p>
            </div>
          </slot>
        </div>

        <!-- Messages (virtualized) -->
        <div
          v-else
          :style="{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }"
        >
          <div
            v-for="virtualItem in virtualizer.getVirtualItems()"
            :key="String(virtualItem.key)"
            :ref="(el) => virtualizer.measureElement(el as HTMLElement | null)"
            :data-index="virtualItem.index"
            :style="{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }"
          >
            <MessageBubble
              :message="props.messages[virtualItem.index]"
            />
          </div>
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
      <Transition name="fade">
        <button
          v-if="showScrollButton && messages.length > 0"
          class="pointer-events-auto absolute bottom-3 z-50 h-9 w-9 rounded-full border border-border bg-background text-foreground shadow-md flex items-center justify-center hover:bg-muted transition-all duration-200"
          :style="{ right: props.scrollButtonRight }"
          title="滚动到底部"
          @click="handleScrollToBottomClick"
        >
          <div class="i-carbon-arrow-down h-4 w-4" />
        </button>
      </Transition>
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
