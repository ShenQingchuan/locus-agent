import type { Message } from '@/composables/useAssistantRuntime'
import { computed, reactive, watch } from 'vue'

export function useReasoningBlockState(getMessage: () => Message) {
  const expandedBlocks = reactive(new Set<number>())
  const userToggledBlocks = reactive(new Set<number>())

  // Index of the reasoning block currently being generated (last part if it's reasoning).
  // Uses a getter so it always reads the current message object (store replaces on each delta).
  const activeReasoningIdx = computed<number | null>(() => {
    const message = getMessage()
    if (!message.isStreaming)
      return null
    const parts = message.parts
    if (!parts || parts.length === 0)
      return null
    const lastIdx = parts.length - 1
    return parts[lastIdx]?.type === 'reasoning' ? lastIdx : null
  })

  // Auto-expand when a new reasoning block becomes active
  watch(activeReasoningIdx, (newIdx, oldIdx) => {
    if (newIdx != null && newIdx !== oldIdx) {
      expandedBlocks.add(newIdx)
      userToggledBlocks.delete(newIdx)
    }
  }, { immediate: true })

  // Auto-collapse all reasoning blocks when streaming finishes
  watch(() => getMessage().isStreaming, (isStreaming) => {
    if (!isStreaming) {
      for (const idx of [...expandedBlocks]) {
        if (!userToggledBlocks.has(idx))
          expandedBlocks.delete(idx)
      }
    }
  })

  function isBlockDone(): boolean {
    return !getMessage().isStreaming
  }

  function isBlockExpanded(partIdx: number): boolean {
    return expandedBlocks.has(partIdx)
  }

  function handleReasoningToggle(partIdx: number) {
    userToggledBlocks.add(partIdx)
    if (expandedBlocks.has(partIdx)) {
      expandedBlocks.delete(partIdx)
    }
    else {
      expandedBlocks.add(partIdx)
    }
  }

  return {
    expandedBlocks,
    userToggledBlocks,
    activeReasoningIdx,
    isBlockDone,
    isBlockExpanded,
    handleReasoningToggle,
  }
}
