import type { RiskLevel } from '@univedge/locus-agent-sdk'
import type { EmitFn } from 'vue'
import type { QuestionAnswer } from '@/api/chat'
import type { ToolCallState } from '@/composables/useAssistantRuntime'
import { onClickOutside } from '@vueuse/core'
import { computed, nextTick, ref, toRefs, watch } from 'vue'
import { buildNewFileDiff, buildReplaceDiff } from '@/utils/diff'
import { parseDelegateMeta, parseQuestionAnswerBlocks } from '@/utils/parsers'
import { toolsHideSummaryRow, toolSummaryResolvers, toolsWithOutputWidget } from '@/utils/toolSummary'

export interface UseToolCallItemProps {
  tool: ToolCallState
  suggestedPattern?: string
  riskLevel?: RiskLevel
  questionData?: {
    questions: Array<{ question: string, options: string[], multiple?: boolean }>
  }
  compact?: boolean
}

export interface ToolCallItemEmits {
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  whitelist: [toolCallId: string, payload: { pattern?: string, scope: 'session' | 'global' }]
  questionAnswer: [toolCallId: string, answers: QuestionAnswer[]]
  delegateResume: [payload: { taskId: string, agentType: string, agentName: string }]
}

export function useToolCallItem(
  props: UseToolCallItemProps,
  _emit: EmitFn<ToolCallItemEmits>,
) {
  const modalOpen = ref(false)
  const inlineDelegateModalOpen = ref(false)
  const whitelistOpen = ref(false)
  const whitelistPopoverRef = ref<HTMLElement | null>(null)
  const terminalRef = ref<HTMLElement | null>(null)

  onClickOutside(whitelistPopoverRef, () => {
    whitelistOpen.value = false
  })

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

  const inlineDiff = computed<string | null>(() => {
    const { toolName, args } = props.tool.toolCall
    const filePath = String(args.file_path ?? '')

    if (toolName === 'str_replace' && typeof args.old_string === 'string') {
      return buildReplaceDiff(filePath, args.old_string, String(args.new_string ?? ''))
    }

    if (toolName === 'write_file' && typeof args.content === 'string') {
      return buildNewFileDiff(filePath, args.content)
    }

    return null
  })

  const inlineDiffFilePath = computed(() =>
    String(props.tool.toolCall.args.file_path ?? ''),
  )

  const defaultSummary = computed(() => {
    const { status, toolCall, result } = props.tool

    const resolver = toolSummaryResolvers[toolCall.toolName]
    if (resolver) {
      const text = resolver(toolCall.args)
      if (text)
        return text
    }

    switch (status) {
      case 'pending': return '执行中...'
      case 'awaiting-approval': return '等待确认'
      case 'awaiting-question': return '等待回答'
      case 'interrupted': return '调用被中断'
      case 'error': return '执行失败'
      case 'completed': {
        if (!result?.result)
          return ''
        const raw = typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result)
        const firstLine = raw.split('\n')[0] ?? ''
        return firstLine.length > 60 ? `${firstLine.slice(0, 60)}...` : firstLine
      }
      default: return ''
    }
  })

  const slotProps = computed(() => ({
    tool: props.tool,
    status: props.tool.status,
    toolName: props.tool.toolCall.toolName,
    args: props.tool.toolCall.args,
    result: props.tool.result?.result,
    isError: props.tool.result?.isError,
  }))

  const HEURISTIC_ARG_KEYS = [
    'file_path',
    'command',
    'pattern',
    'query',
    'prompt',
    'path',
    'task',
    'description',
  ]

  const acpSummary = computed(() => {
    const { args } = props.tool.toolCall
    for (const key of HEURISTIC_ARG_KEYS) {
      const val = args[key]
      if (typeof val === 'string' && val.trim()) {
        const s = val.trim()
        return s.length > 80 ? `${s.slice(0, 80)}...` : s
      }
    }
    for (const val of Object.values(args)) {
      if (typeof val === 'string' && val.trim() && val.length <= 120) {
        return val.length > 80 ? `${val.slice(0, 80)}...` : val
      }
    }
    return ''
  })

  const acpDelegateDeltas = computed(() => props.tool.delegateDeltas ?? [])

  const acpDelegateStatus = computed<'pending' | 'completed' | 'error'>(() => {
    const s = props.tool.status
    if (s === 'error' || s === 'interrupted')
      return 'error'
    if (s === 'completed')
      return 'completed'
    return 'pending'
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

  const isWritePlan = computed(() => props.tool.toolCall.toolName === 'write_plan')

  const writePlanArgs = computed(() => {
    if (!isWritePlan.value)
      return null
    const args = props.tool.toolCall.args
    return {
      filename: String(args.filename ?? ''),
      content: String(args.content ?? ''),
    }
  })

  const writePlanStatus = computed<'pending' | 'completed' | 'error'>(() => {
    const s = props.tool.status
    if (s === 'error' || s === 'interrupted')
      return 'error'
    if (s === 'completed')
      return 'completed'
    return 'pending'
  })

  const isBash = computed(() => props.tool.toolCall.toolName === 'bash')
  const isSilentTool = computed(() => props.tool.toolCall.toolName === 'plan_exit')

  const diffExpanded = ref(true)

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

  const hideSummary = computed(() => toolsWithOutputWidget.has(props.tool.toolCall.toolName)
    && (props.tool.status === 'completed' || props.tool.status === 'error' || props.tool.status === 'interrupted'))

  const hideSummaryByTool = computed(() => toolsHideSummaryRow.has(props.tool.toolCall.toolName))

  const shouldHideSummary = computed(() => hideSummary.value || hideSummaryByTool.value)

  const hasOutputWidget = computed(() => toolsWithOutputWidget.has(props.tool.toolCall.toolName))

  const hasTerminalOutput = computed(() => hasOutputWidget.value && !!props.tool.output)

  const terminalOutput = computed(() => props.tool.output || '')

  const isToolRunning = computed(() => {
    return hasOutputWidget.value && props.tool.status === 'pending'
  })

  watch(terminalOutput, () => {
    nextTick(() => {
      if (terminalRef.value) {
        terminalRef.value.scrollTop = terminalRef.value.scrollHeight
      }
    })
  })

  return {
    ...toRefs(props),
    modalOpen,
    inlineDelegateModalOpen,
    whitelistOpen,
    whitelistPopoverRef,
    terminalRef,
    statusIcon,
    statusIconClass,
    inlineDiff,
    inlineDiffFilePath,
    defaultSummary,
    slotProps,
    acpSummary,
    acpDelegateDeltas,
    acpDelegateStatus,
    isAskQuestion,
    isDelegate,
    isInlineDelegate,
    inlineDelegateResultText,
    isWritePlan,
    writePlanArgs,
    writePlanStatus,
    isBash,
    isSilentTool,
    diffExpanded,
    delegateArgs,
    delegateMeta,
    delegateDeltasFromResult,
    questionResultPairs,
    shouldHideSummary,
    hasOutputWidget,
    hasTerminalOutput,
    terminalOutput,
    isToolRunning,
  }
}
