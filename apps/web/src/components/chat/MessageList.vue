<script setup lang="ts">
import type { Message } from '@/composables/assistant-runtime'
import { nextTick, ref, watch } from 'vue'
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
const previousMessagesLength = ref(0)

// --- Smart scroll state ---
// Whether the user has intentionally scrolled away from the bottom
const userScrolledUp = ref(false)
// Guard: ignore scroll events that we triggered programmatically
let isProgrammaticScroll = false
// Debounce handle for rAF-based auto-scroll
let scrollRafId: number | null = null

// Threshold (px) to consider "at bottom"
const BOTTOM_THRESHOLD = 80

function isAtBottom(): boolean {
  const el = containerRef.value
  if (!el)
    return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
}

// Reactive flag for template (scroll-to-bottom button visibility)
const showScrollButton = ref(false)

// --- Detect user scroll intent via native event ---
function onScroll() {
  // Skip scroll events we fired ourselves
  if (isProgrammaticScroll)
    return

  const atBottom = isAtBottom()
  showScrollButton.value = !atBottom

  if (atBottom) {
    // User scrolled back to bottom (manually) → re-enable auto-scroll
    userScrolledUp.value = false
  }
  else {
    // User is not at bottom → they scrolled up, respect their intent
    userScrolledUp.value = true
  }
}

// --- Scroll to bottom (instant, no animation) ---
// During streaming, content changes every few ms. Smooth scroll animations
// get queued up and fight each other, causing jank. We always use instant
// scroll and coalesce via requestAnimationFrame so we scroll at most once
// per frame — this is buttery smooth.
function scrollToBottom(instant = true) {
  const container = containerRef.value
  if (!container)
    return

  isProgrammaticScroll = true
  if (instant) {
    container.scrollTop = container.scrollHeight - container.clientHeight
  }
  else {
    container.scrollTo({ top: container.scrollHeight - container.clientHeight, behavior: 'smooth' })
  }
  showScrollButton.value = false

  // Release the guard after the browser has had a chance to fire scroll events
  requestAnimationFrame(() => {
    isProgrammaticScroll = false
  })
}

// Coalesced version: at most one scroll per animation frame
function scheduleScrollToBottom() {
  if (scrollRafId !== null)
    return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    scrollToBottom(true)
  })
}

// --- Auto-scroll on content change ---
watch(
  // Watch message count + last message content length (cheap, avoids deep)
  () => {
    const len = props.messages.length
    const last = len > 0 ? props.messages[len - 1] : null
    return [len, last?.content?.length ?? 0] as const
  },
  async ([newLen]) => {
    // Session switched / cleared
    if (newLen === 0) {
      previousMessagesLength.value = 0
      userScrolledUp.value = false
      return
    }

    const isInitialLoad = previousMessagesLength.value === 0 && newLen > 0
    previousMessagesLength.value = newLen

    // If user scrolled up, respect it — don't auto-scroll
    if (userScrolledUp.value && !isInitialLoad)
      return

    await nextTick()

    if (isInitialLoad) {
      // First load / session switch: instant scroll with retries for lazy DOM
      scrollToBottom(true)
      // Retry for images / code blocks that render async
      ;[50, 150, 300].forEach(delay => setTimeout(scrollToBottom, delay, true))
    }
    else {
      // Streaming or new message: coalesce to one scroll per frame
      scheduleScrollToBottom()
    }
  },
)

// User clicks the "scroll to bottom" button
function handleScrollToBottomClick() {
  userScrolledUp.value = false
  scrollToBottom(false) // smooth scroll for explicit user action
}

// Scroll a specific tool-call card into view (used by jump-to-delegate).
// Use querySelectorAll + last element so that if the same toolCallId appears in
// multiple turns (some providers reuse sequential IDs across API calls), we
// always scroll to the most recent card — which is lowest in the DOM.
function scrollToToolCall(toolCallId: string) {
  const els = containerRef.value?.querySelectorAll(`[data-tool-call-id="${toolCallId}"]`)
  if (els && els.length > 0) {
    // Convert to array so we can use standard indexing; take the last match so
    // that if toolCallIds collide across turns we always land on the newest card.
    const last = Array.from(els).at(-1)
    last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

// Expose scroll helpers for external use
defineExpose({ scrollToBottom, scrollToToolCall })
</script>

<template>
  <div class="relative h-full">
    <div
      ref="containerRef"
      class="h-full overflow-y-auto overflow-x-hidden px-4 py-4 bg-background"
      @scroll.passive="onScroll"
    >
      <div class="max-w-3xl mx-auto">
        <!-- Loading conversation -->
        <div
          v-if="messages.length === 0 && isLoadingConversation"
          class="flex-col-center h-full py-20 text-muted-foreground"
        >
          <div class="i-svg-spinners:ring-resize h-10 w-10 mb-4 opacity-70" />
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
