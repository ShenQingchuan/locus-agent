<script setup lang="ts">
import type { QuestionAnswer } from '@/api/chat'
import type { ToolCallState } from '@/composables/assistant-runtime'
import { computed, ref } from 'vue'
import { parseDelegateMeta, parseQuestionAnswerBlocks } from '@/utils/parsers'
import DelegateCard from './DelegateCard.vue'
import InlineDelegateModal from './InlineDelegateModal.vue'
import QuestionCard from './QuestionCard.vue'

const props = defineProps<{
  tool: ToolCallState
  questionData?: {
    questions: Array<{ question: string, options: string[], multiple?: boolean }>
  }
}>()

const emit = defineEmits<{
  questionAnswer: [toolCallId: string, answers: QuestionAnswer[]]
  delegateResume: [payload: { taskId: string, agentType: string, agentName: string }]
}>()

const inlineDelegateModalOpen = ref(false)

const statusIcon = computed(() => {
  switch (props.tool.status) {
    case 'pending': return 'i-svg-spinners:90-ring-with-bg'
    case 'awaiting-approval': return 'i-carbon-warning-alt'
    case 'awaiting-question': return 'i-carbon-help'
    case 'completed': return 'i-carbon-checkmark'
    case 'error': return 'i-carbon-close'
    case 'interrupted': return 'i-solar:forbidden-circle-linear'
    default: return 'i-carbon-tool-box'
  }
})

const statusIconClass = computed(() => {
  switch (props.tool.status) {
    case 'pending': return 'text-muted-foreground'
    case 'error': return 'text-destructive'
    case 'interrupted': return 'text-warning'
    default: return 'text-muted-foreground'
  }
})

const isAskQuestion = computed(() => props.tool.toolCall.toolName === 'ask_question')
const isDelegate = computed(() => props.tool.toolCall.toolName === 'delegate')

const INLINE_DELEGATE_TYPES = new Set(['memory_tagger', 'memory-tagger'])

const isInlineDelegate = computed(() => {
  if (!isDelegate.value)
    return false
  const agentType = String(props.tool.toolCall.args.agent_type ?? '')
  return INLINE_DELEGATE_TYPES.has(agentType)
})

const inlineDelegateResultText = computed(() => {
  if (!isInlineDelegate.value)
    return null
  const { status } = props.tool
  if (status === 'pending')
    return '执行中...'
  if (status === 'error' || status === 'interrupted')
    return '执行失败'
  const raw = props.tool.result?.result
  if (!raw || typeof raw !== 'object')
    return null
  const text = (raw as { result?: string }).result ?? ''
  const firstLine = text.split('\n').find(l => l.trim()) ?? ''
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}...` : firstLine
})

const delegateArgs = computed(() => {
  if (!isDelegate.value)
    return null
  const args = props.tool.toolCall.args
  return {
    agentName: String(args.agent_name ?? args.agent_type ?? '子代理'),
    agentType: String(args.agent_type ?? 'custom'),
    task: String(args.task ?? ''),
    context: args.context ? String(args.context) : undefined,
  }
})

const delegateMeta = computed(() => {
  if (!isDelegate.value)
    return null
  if (props.tool.status !== 'completed' && props.tool.status !== 'error' && props.tool.status !== 'interrupted')
    return null
  const raw = props.tool.result?.result
  if (!raw)
    return null
  return parseDelegateMeta(raw)
})

const delegateDeltasFromResult = computed((): Array<{ type: 'text' | 'reasoning' | 'tool_start' | 'tool_result', content: string, toolName?: string, isError?: boolean }> => {
  if (!isDelegate.value)
    return []
  const raw = props.tool.result?.result
  if (!raw || typeof raw !== 'object')
    return []
  const deltas = (raw as { deltas?: Array<{ type: string, content: string, toolName?: string, isError?: boolean }> }).deltas ?? []
  return deltas.filter((d): d is { type: 'text' | 'reasoning' | 'tool_start' | 'tool_result', content: string, toolName?: string, isError?: boolean } =>
    ['text', 'reasoning', 'tool_start', 'tool_result'].includes(d.type),
  )
})

const questionResultPairs = computed<Array<{ question: string, answer: string }> | null>(() => {
  if (!isAskQuestion.value)
    return null
  if (props.tool.status !== 'completed' && props.tool.status !== 'error' && props.tool.status !== 'interrupted')
    return null
  const raw = props.tool.result?.result
  return parseQuestionAnswerBlocks(raw)
})
</script>

<template>
  <!-- Awaiting question: question card -->
  <QuestionCard
    v-if="tool.status === 'awaiting-question' && isAskQuestion && questionData"
    :tool-call-id="tool.toolCall.toolCallId"
    :questions="questionData.questions"
    @submit="(toolCallId, answers) => emit('questionAnswer', toolCallId, answers)"
  />

  <!-- ask_question 完成后展示问答结果 -->
  <div
    v-if="questionResultPairs"
    class="mt-1.5 rounded-lg bg-muted/30 px-3 py-2.5 text-left"
  >
    <div class="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground/70">
      <div class="i-ic:round-question-mark h-3 w-3 flex-shrink-0" />
      <span>提问与回答</span>
    </div>
    <div class="space-y-1.5">
      <div v-for="(pair, idx) in questionResultPairs" :key="idx">
        <div class="text-sm text-foreground">
          {{ pair.question }}
        </div>
        <div class="text-xs text-muted-foreground mt-0.5">
          {{ pair.answer }}
        </div>
      </div>
    </div>
  </div>

  <!-- Inline delegate (compact row for lightweight sub-agents like memory_tagger) -->
  <div
    v-if="isInlineDelegate && delegateArgs"
    class="flex items-center gap-1.5 text-muted-foreground cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
    @click="inlineDelegateModalOpen = true"
  >
    <div
      class="h-3 w-3 flex-shrink-0"
      :class="[statusIcon, statusIconClass]"
    />
    <code class="text-xs font-mono whitespace-nowrap">{{ delegateArgs.agentName }}</code>
    <span class="text-xs font-mono truncate">{{ inlineDelegateResultText }}</span>
  </div>

  <!-- Inline delegate modal (streaming view) -->
  <InlineDelegateModal
    v-if="isInlineDelegate && delegateArgs"
    :visible="inlineDelegateModalOpen"
    :agent-name="delegateArgs.agentName"
    :status="tool.status === 'error' || tool.status === 'interrupted' ? 'error' : tool.status === 'completed' ? 'completed' : 'pending'"
    :deltas="tool.delegateDeltas?.length ? tool.delegateDeltas : delegateDeltasFromResult"
    @close="inlineDelegateModalOpen = false"
  />

  <!-- Delegate 子代理卡片 (full card, skip for inline types) -->
  <DelegateCard
    v-if="isDelegate && delegateArgs && !isInlineDelegate"
    :tool-call-id="tool.toolCall.toolCallId"
    :agent-name="delegateArgs.agentName"
    :agent-type="delegateArgs.agentType"
    :task="delegateArgs.task"
    :context="delegateArgs.context"
    :status="tool.status === 'error' || tool.status === 'interrupted' ? 'error' : tool.status === 'completed' ? 'completed' : 'pending'"
    :task-id="delegateMeta?.taskId || undefined"
    :deltas="tool.delegateDeltas?.length ? tool.delegateDeltas : delegateDeltasFromResult"
    :iterations="delegateMeta?.iterations"
    :usage="delegateMeta ? { inputTokens: delegateMeta.inputTokens, outputTokens: delegateMeta.outputTokens, totalTokens: delegateMeta.totalTokens } : undefined"
    class="mt-1.5"
    @resume="(payload) => emit('delegateResume', payload)"
  />
</template>
