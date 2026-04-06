import type { VirtualItem, Virtualizer } from '@tanstack/vue-virtual'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, toValue } from 'vue'

/** Mirrors TanStack default: adjust scroll when an item above the viewport fold resizes */
function defaultShouldAdjustScrollOnItemResize(
  item: VirtualItem,
  instance: Virtualizer<HTMLElement, HTMLElement>,
): boolean {
  const el = instance.scrollElement
  if (!el || !('scrollTop' in el))
    return true
  const scrollTop = (el as HTMLElement).scrollTop
  const adjustments = (instance as unknown as { scrollAdjustments: number }).scrollAdjustments ?? 0
  return item.start < scrollTop + adjustments
}

export function useMessageListVirtualizer(options: {
  messageCount: MaybeRefOrGetter<number>
  scrollRoot: Ref<HTMLElement | null>
  /**
   * When true, user intentionally left the bottom — disable Virtualizer's resize scroll compensation.
   * Otherwise streaming row growth keeps calling `_scrollToOffset` and pulls the viewport back down.
   */
  userScrolledUp: Ref<boolean>
}) {
  const virtualizer = useVirtualizer(
    computed(() => {
      // Re-subscribe when follow-mode toggles so TanStack picks up new callback behavior
      void options.userScrolledUp.value

      return {
        count: toValue(options.messageCount),
        getScrollElement: () => options.scrollRoot.value,
        estimateSize: () => 80,
        measureElement: (el: HTMLElement) => el.getBoundingClientRect().height,
        overscan: 5,
        shouldAdjustScrollPositionOnItemSizeChange: (
          item: VirtualItem,
          _delta: number,
          instance: Virtualizer<HTMLElement, HTMLElement>,
        ) => {
          if (options.userScrolledUp.value)
            return false

          // When the user is near the bottom, treat resize of any item (including the last
          // streaming row) as a reason to keep the viewport pinned to the bottom.
          const el = instance.scrollElement
          if (el) {
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
            if (distanceFromBottom <= 20)
              return true
          }

          return defaultShouldAdjustScrollOnItemResize(item, instance)
        },
      }
    }),
  )

  return { virtualizer }
}
