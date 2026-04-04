import type { ComputedRef } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

/**
 * Local UI state: modals, whitelist popover, terminal ref, diff toggle, auto-scroll.
 */
export function useToolCallItemShell(terminalOutput: ComputedRef<string>) {
  const modalOpen = ref(false)
  const inlineDelegateModalOpen = ref(false)
  const whitelistOpen = ref(false)
  const whitelistPopoverRef = ref<HTMLElement | null>(null)
  const terminalRef = ref<HTMLElement | null>(null)
  const diffExpanded = ref(true)

  onClickOutside(whitelistPopoverRef, () => {
    whitelistOpen.value = false
  })

  watch(terminalOutput, () => {
    nextTick(() => {
      if (terminalRef.value) {
        terminalRef.value.scrollTop = terminalRef.value.scrollHeight
      }
    })
  })

  return {
    modalOpen,
    inlineDelegateModalOpen,
    whitelistOpen,
    whitelistPopoverRef,
    terminalRef,
    diffExpanded,
  }
}
