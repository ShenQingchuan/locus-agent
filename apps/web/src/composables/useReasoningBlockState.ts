import type { Message } from '@/composables/useAssistantRuntime'
import { computed, reactive, watch } from 'vue'

export function useReasoningBlockState(message: Message) {
  const expandedBlocks = reactive(new Set<number>())
  const userToggledBlocks = reactive(new Set<number>())

  // Index of the reasoning block currently being generated (last part if it's reasoning)
  const activeReasoningIdx = computed<number | null>(() => {
    if (!message.isStreaming)
      return null
    const parts = message.parts
    if (!parts || parts.length === 0)
      return null
    const lastIdx = parts.length - 1
    return parts[lastIdx]?.type === 'reasoning' ? lastIdx : null
  })

  // Auto-expand active reasoning block; auto-collapse when it finishes
  watch(activeReasoningIdx, (newIdx, oldIdx) => {
    if (oldIdx != null && oldIdx !== newIdx && !userToggledBlocks.has(oldIdx))
      expandedBlocks.delete(oldIdx)
    if (newIdx != null && newIdx !== oldIdx) {
      expandedBlocks.add(newIdx)
      userToggledBlocks.delete(newIdx)
    }
  }, { immediate: true })

  function isBlockDone(partIdx: number): boolean {
    if (!message.isStreaming)
      return true
    const parts = message.parts
    return !parts || partIdx + 1 < parts.length
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
