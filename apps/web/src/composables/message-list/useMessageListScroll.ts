import type { Virtualizer } from '@tanstack/vue-virtual'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Message } from '@/composables/assistant-runtime'
import {
  nextTick,
  onBeforeUnmount,
  ref,
  toValue,
  watch,
} from 'vue'

/** Tracks everything that can grow the last message without changing `content.length` (reasoning, tool output, etc.) */
function streamingScrollSignature(messages: Message[]): string {
  const last = messages.at(-1)
  if (!last)
    return `len:${messages.length}`
  let toolOut = 0
  let delegateEvents = 0
  if (last.toolCalls?.length) {
    for (const tc of last.toolCalls) {
      toolOut += tc.output?.length ?? 0
      delegateEvents += tc.delegateDeltas?.length ?? 0
    }
  }
  return [
    messages.length,
    last.id,
    last.content.length,
    last.reasoning?.length ?? 0,
    last.parts?.length ?? 0,
    toolOut,
    delegateEvents,
    last.isStreaming ? 1 : 0,
  ].join(':')
}

export function useMessageListScroll(options: {
  containerRef: Ref<HTMLElement | null>
  scrollMeasureRef: Ref<HTMLElement | null>
  messages: MaybeRefOrGetter<Message[]>
  isStreaming: MaybeRefOrGetter<boolean>
  virtualizer: Ref<Virtualizer<HTMLElement, HTMLElement>>
  /** Shared with useMessageListVirtualizer — must be the same ref so TanStack can skip resize scroll-pull */
  userScrolledUp: Ref<boolean>
}) {
  const { containerRef, scrollMeasureRef, virtualizer } = options

  const previousMessagesLength = ref(0)

  const userScrolledUp = options.userScrolledUp
  let isProgrammaticScroll = false
  let scrollRafId: number | null = null
  /** Distance from bottom (px) past which we show the "scroll to bottom" affordance */
  const SCROLL_BUTTON_THRESHOLD = 80
  /** Must be this close to the bottom (px) to resume auto-follow — much stricter than the button threshold */
  const FOLLOW_RESUME_PX = 8
  /** scrollTop decreased by more than this → user intentionally scrolled up, even if still "near" bottom */
  const UPWARD_SCROLL_INTENT_PX = 2

  let lastScrollTopForIntent = 0

  const showScrollButton = ref(false)

  function onScroll() {
    if (isProgrammaticScroll)
      return

    const el = containerRef.value
    if (!el)
      return

    const st = el.scrollTop
    const distanceFromBottom = el.scrollHeight - st - el.clientHeight

    // Any upward gesture pauses follow — avoids treating "slightly above bottom" as still "at bottom" (wide threshold bug)
    const scrolledUp = st < lastScrollTopForIntent - UPWARD_SCROLL_INTENT_PX
    if (scrolledUp) {
      userScrolledUp.value = true
      if (scrollRafId !== null) {
        cancelAnimationFrame(scrollRafId)
        scrollRafId = null
      }
    }

    // Resume follow only when the user is not scrolling up in this event and is essentially flush to the bottom.
    // This prevents a tiny upward nudge from being immediately overwritten by the bottom-resume logic.
    if (!scrolledUp && distanceFromBottom <= FOLLOW_RESUME_PX) {
      userScrolledUp.value = false
    }

    lastScrollTopForIntent = st
    showScrollButton.value = distanceFromBottom > SCROLL_BUTTON_THRESHOLD
  }

  function scrollToBottom(instant = true) {
    const container = containerRef.value
    const count = toValue(options.messages).length
    if (!container || count === 0)
      return

    isProgrammaticScroll = true
    if (instant) {
      // Direct DOM scroll for accuracy during streaming; virtualizer cache may lag behind row growth.
      container.scrollTop = container.scrollHeight - container.clientHeight
    }
    else {
      // Keep smooth scrolling via the Virtualizer for better UX on explicit user actions.
      virtualizer.value.scrollToIndex(count - 1, {
        align: 'end',
        behavior: 'smooth',
      })
    }
    showScrollButton.value = false

    requestAnimationFrame(() => {
      isProgrammaticScroll = false
      const c = containerRef.value
      if (c)
        lastScrollTopForIntent = c.scrollTop
    })
  }

  function scheduleScrollToBottom() {
    if (scrollRafId !== null)
      cancelAnimationFrame(scrollRafId)
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null
      scrollToBottom(true)
    })
  }

  let listResizeObserver: ResizeObserver | null = null

  function teardownListResizeObserver() {
    listResizeObserver?.disconnect()
    listResizeObserver = null
  }

  function setupListResizeObserver() {
    teardownListResizeObserver()
    const el = scrollMeasureRef.value
    if (!el || !toValue(options.isStreaming) || userScrolledUp.value)
      return
    listResizeObserver = new ResizeObserver(() => {
      if (userScrolledUp.value || !toValue(options.isStreaming))
        return
      scheduleScrollToBottom()
    })
    listResizeObserver.observe(el)
  }

  watch(
    () => streamingScrollSignature(toValue(options.messages)),
    async () => {
      const msgs = toValue(options.messages)
      const newLen = msgs.length
      if (newLen === 0) {
        previousMessagesLength.value = 0
        userScrolledUp.value = false
        return
      }

      const isInitialLoad = previousMessagesLength.value === 0 && newLen > 0
      previousMessagesLength.value = newLen

      if (userScrolledUp.value && !isInitialLoad)
        return

      // Wait for Vue DOM; do NOT call virtualizer.measure() here — it clears itemSizeCache and
      // temporarily resets all row heights to estimates, which snaps scroll position incorrectly.
      await nextTick()

      if (isInitialLoad) {
        scrollToBottom(true)
        ;[50, 150, 300].forEach(delay => setTimeout(scrollToBottom, delay, true))
      }
      else {
        scheduleScrollToBottom()
      }
    },
  )

  watch(
    [() => toValue(options.isStreaming), userScrolledUp, scrollMeasureRef],
    async () => {
      await nextTick()
      if (toValue(options.isStreaming) && !userScrolledUp.value)
        setupListResizeObserver()
      else
        teardownListResizeObserver()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(teardownListResizeObserver)

  function handleScrollToBottomClick() {
    userScrolledUp.value = false
    scrollToBottom(false)
  }

  function scrollToToolCall(toolCallId: string) {
    const els = containerRef.value?.querySelectorAll(`[data-tool-call-id="${toolCallId}"]`)
    if (els && els.length > 0) {
      const last = Array.from(els).at(-1)
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  return {
    showScrollButton,
    onScroll,
    handleScrollToBottomClick,
    scrollToBottom,
    scrollToToolCall,
  }
}
