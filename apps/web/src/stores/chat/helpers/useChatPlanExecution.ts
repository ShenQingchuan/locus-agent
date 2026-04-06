import type { Ref } from 'vue'

export interface PlanExecutionDeps {
  currentConversationId: Ref<string | null>
  latestPlanByConversation: Record<string, { filename: string, content: string }>
  currentPlan: Ref<{ filename: string, content: string } | null>
  useAutoPlanBinding: () => void
  setCodingMode: (mode: 'build' | 'plan') => void
  sendMessage: (content: string, arg1?: undefined, arg2?: undefined, opts?: { metadata?: Record<string, unknown> }) => Promise<string | null>
}

export function useChatPlanExecution(deps: PlanExecutionDeps) {
  function startPlanExecution(filename: string, content: string) {
    const conversationId = deps.currentConversationId.value
    if (!conversationId)
      return

    const snapshot = { filename, content }
    deps.latestPlanByConversation[conversationId] = snapshot
    deps.currentPlan.value = snapshot

    deps.useAutoPlanBinding()
    deps.setCodingMode('build')
    deps.sendMessage(
      '开始执行当前已绑定计划。请先 read_plan，再按计划顺序实施，并使用 manage_todos 跟踪进度。',
      undefined,
      undefined,
      { metadata: { trigger: 'start_plan_execution' } },
    )
  }

  return { startPlanExecution }
}
