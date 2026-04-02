import type { PlanBinding } from '@univedge/locus-agent-sdk'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchConversationPlans } from '@/api/chat'

export const usePlanStore = defineStore('plan', () => {
  // Coding mode: build (直接编码) / plan (先规划再编码) — 仅 Coding 空间可用
  const codingMode = ref<'build' | 'plan'>('build')
  const currentPlan = ref<{ filename: string, content: string } | null>(null)
  const isLoadingPlan = ref(false)
  const planBindings = ref<Record<string, { mode: 'auto' | 'none' }>>({})
  const latestPlanByConversation = ref<Record<string, { filename: string, content: string }>>({})
  // Plan viewer state — Coding 页面中间面板展示实现计划
  const viewingPlan = ref<{ filename: string, content: string } | null>(null)

  function openPlan(filename: string, content: string) {
    viewingPlan.value = { filename, content }
  }

  function closePlan() {
    viewingPlan.value = null
  }

  function getPlanBindingForConversation(conversationId?: string | null): { mode: 'auto' | 'none' } {
    if (!conversationId)
      return { mode: 'auto' }
    return planBindings.value[conversationId] ?? { mode: 'auto' }
  }

  function setPlanBinding(mode: 'auto' | 'none', conversationId?: string | null) {
    if (!conversationId)
      return
    planBindings.value[conversationId] = { mode }
  }

  function unbindPlan(conversationId?: string | null) {
    setPlanBinding('none', conversationId)
  }

  function useAutoPlanBinding(conversationId?: string | null) {
    setPlanBinding('auto', conversationId)
  }

  async function refreshConversationPlans(conversationId?: string | null) {
    if (!conversationId) {
      currentPlan.value = null
      return
    }

    isLoadingPlan.value = true
    try {
      const payload = await fetchConversationPlans(conversationId)
      if (!payload) {
        currentPlan.value = null
        return
      }
      currentPlan.value = payload.currentPlan
    }
    finally {
      isLoadingPlan.value = false
    }
  }

  function currentPlanBinding(conversationId?: string | null) {
    return computed(() => getPlanBindingForConversation(conversationId))
  }

  function activeBoundPlanFilename(conversationId?: string | null) {
    return computed(() => {
      const binding = getPlanBindingForConversation(conversationId)
      return binding.mode === 'none' ? null : currentPlan.value?.filename ?? null
    })
  }

  function getPlanBindingPayload(conversationId: string): PlanBinding | undefined {
    const state = getPlanBindingForConversation(conversationId)
    if (state.mode === 'none')
      return { mode: 'none' }
    return { mode: 'auto' }
  }

  function openCurrentPlan(conversationId?: string | null): boolean {
    const binding = getPlanBindingForConversation(conversationId)
    if (binding.mode === 'none')
      return false
    if (!currentPlan.value)
      return false
    openPlan(currentPlan.value.filename, currentPlan.value.content)
    return true
  }

  function onWritePlanDetected(conversationId: string, currentConversationId: string | null, filename: string, content: string) {
    const snapshot = { filename, content }
    latestPlanByConversation.value[conversationId] = snapshot
    if (conversationId === currentConversationId) {
      currentPlan.value = snapshot
      openPlan(filename, content)
    }
  }

  const planGeneratingPlaceholder = '计划生成中 ...'

  function onPlanPreviewStart(conversationId: string, currentConversationId: string | null) {
    if (conversationId !== currentConversationId)
      return
    openPlan(planGeneratingPlaceholder, '')
  }

  function onPlanPreviewDelta(conversationId: string, currentConversationId: string | null, delta: string) {
    if (conversationId !== currentConversationId)
      return
    const existing = viewingPlan.value
    if (!existing || existing.filename !== planGeneratingPlaceholder) {
      openPlan(planGeneratingPlaceholder, delta)
      return
    }
    viewingPlan.value = {
      ...existing,
      content: `${existing.content}${delta}`,
    }
  }

  function onPlanPreviewDone(_conversationId: string, _currentConversationId: string | null) {
    // Keep preview open. If write_plan succeeds, onWritePlanDetected will replace it
    // with the persisted plan filename/content.
  }

  function toggleCodingMode() {
    codingMode.value = codingMode.value === 'build' ? 'plan' : 'build'
  }

  function setCodingMode(mode: 'build' | 'plan') {
    codingMode.value = mode
  }

  return {
    codingMode,
    currentPlan,
    isLoadingPlan,
    planBindings,
    latestPlanByConversation,
    viewingPlan,
    openPlan,
    closePlan,
    getPlanBindingForConversation,
    setPlanBinding,
    unbindPlan,
    useAutoPlanBinding,
    refreshConversationPlans,
    currentPlanBinding,
    activeBoundPlanFilename,
    getPlanBindingPayload,
    openCurrentPlan,
    onWritePlanDetected,
    onPlanPreviewStart,
    onPlanPreviewDelta,
    onPlanPreviewDone,
    toggleCodingMode,
    setCodingMode,
  }
})
