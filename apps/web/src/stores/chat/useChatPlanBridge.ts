import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { usePlanStore } from '@/stores/plan'

export function useChatPlanBridge(currentConversationId: Ref<string | null>) {
  const planStore = usePlanStore()

  const {
    currentPlan,
    isLoadingPlan,
    viewingPlan,
  } = storeToRefs(planStore)

  const currentPlanBinding = computed(() => planStore.getPlanBindingForConversation(currentConversationId.value))
  const activeBoundPlanFilename = computed(() => (currentPlanBinding.value.mode === 'none' ? null : currentPlan.value?.filename ?? null))

  function setPlanBinding(mode: 'auto' | 'none') {
    planStore.setPlanBinding(mode, currentConversationId.value)
  }
  function unbindPlan() {
    planStore.unbindPlan(currentConversationId.value)
  }
  function useAutoPlanBinding() {
    planStore.useAutoPlanBinding(currentConversationId.value)
  }
  function refreshConversationPlans(conversationId?: string | null) {
    return planStore.refreshConversationPlans(conversationId ?? currentConversationId.value)
  }
  function openCurrentPlan(): boolean {
    return planStore.openCurrentPlan(currentConversationId.value)
  }
  function onWritePlanDetected(conversationId: string, filename: string, content: string) {
    planStore.onWritePlanDetected(conversationId, currentConversationId.value, filename, content)
  }
  function onPlanPreviewStart(conversationId: string) {
    planStore.onPlanPreviewStart(conversationId, currentConversationId.value)
  }
  function onPlanPreviewDelta(conversationId: string, delta: string) {
    planStore.onPlanPreviewDelta(conversationId, currentConversationId.value, delta)
  }
  function onPlanPreviewDone(conversationId: string) {
    planStore.onPlanPreviewDone(conversationId, currentConversationId.value)
  }

  return {
    currentPlan,
    isLoadingPlan,
    viewingPlan,
    currentPlanBinding,
    activeBoundPlanFilename,
    setPlanBinding,
    unbindPlan,
    useAutoPlanBinding,
    refreshConversationPlans,
    openCurrentPlan,
    openPlan: planStore.openPlan,
    closePlan: planStore.closePlan,
    onWritePlanDetected,
    onPlanPreviewStart,
    onPlanPreviewDelta,
    onPlanPreviewDone,
  }
}
