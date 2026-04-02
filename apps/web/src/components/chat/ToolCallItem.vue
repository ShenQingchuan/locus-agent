<script setup lang="ts">
import type { RiskLevel } from '@univedge/locus-agent-sdk'
import type { QuestionAnswer } from '@/api/chat'
import type { ToolCallState } from '@/composables/useAssistantRuntime'
import { onClickOutside } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import DiffViewer from '@/components/code/DiffViewer.vue'
import { parseDelegateMeta } from '@/utils/delegateParsing'
import { buildNewFileDiff, buildReplaceDiff } from '@/utils/diff'
import { toolsHideSummaryRow, toolSummaryResolvers, toolsWithOutputWidget } from '@/utils/toolSummary'
import DelegateCard from './DelegateCard.vue'
import InlineDelegateModal from './InlineDelegateModal.vue'
import PlanCard from './PlanCard.vue'
import QuestionCard from './QuestionCard.vue'
import ToolCallModal from './ToolCallModal.vue'
import WhitelistPopover from './WhitelistPopover.vue'

const props = defineProps<{
  tool: ToolCallState
  /** 服务端预计算的建议匹配前缀 */
  suggestedPattern?: string
  /** 服务端预计算的风险等级 */
  riskLevel?: RiskLevel
  /** 提问工具的问题数据 */
  questionData?: {
    questions: Array<{ question: string, options: string[], multiple?: boolean }>
  }
  /** ACP 紧凑展示模式 */
  compact?: boolean
}>()
const emit = defineEmits<{
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  whitelist: [toolCallId: string, payload: { pattern?: string, scope: 'session' | 'global' }]
  questionAnswer: [toolCallId: string, answers: QuestionAnswer[]]
  delegateResume: [payload: { taskId: string, agentType: string, agentName: string }]
}>()
defineSlots<{
  summary?: (props: {
    tool: ToolCallState
    status: ToolCallState['status']
    toolName: string
    args: Record<string, unknown>
    result?: unknown
    isError?: boolean
  }) => any
}>()
const RE_DOUBLE_NEWLINE = /\n\n/
const RE_QUESTION_ANSWER_BLOCK = /^- ([^\n：]+)：\n([\s\S]*)$/

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

/** Inline diff patch string for str_replace / write_file tool calls */
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

  // Tool-specific summary from args (shown regardless of status)
  const resolver = toolSummaryResolvers[toolCall.toolName]
  if (resolver) {
    const text = resolver(toolCall.args)
    if (text)
      return text
  }

  // Generic status-based fallback
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

/** Whether this is an ask_question tool */
const isAskQuestion = computed(() => props.tool.toolCall.toolName === 'ask_question')

/** Whether this is a delegate tool */
const isDelegate = computed(() => props.tool.toolCall.toolName === 'delegate')

const INLINE_DELEGATE_TYPES = new Set(['memory_tagger', 'memory-tagger'])

/** Lightweight delegate types rendered as compact inline rows instead of full DelegateCard */
const isInlineDelegate = computed(() => {
  if (!isDelegate.value)
    return false
  const agentType = String(props.tool.toolCall.args.agent_type ?? '')
  return INLINE_DELEGATE_TYPES.has(agentType)
})

/** Extract the sub-agent's final text output for inline display */
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

/** Whether this is a write_plan tool */
const isWritePlan = computed(() => props.tool.toolCall.toolName === 'write_plan')

/** write_plan tool arguments */
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

/** Whether this is a bash tool */
const isBash = computed(() => props.tool.toolCall.toolName === 'bash')
const isSilentTool = computed(() => props.tool.toolCall.toolName === 'plan_exit')

const bashExpanded = ref(props.tool.status === 'pending')
const diffExpanded = ref(true)

watch(() => props.tool.status, (newStatus, oldStatus) => {
  if (isBash.value && oldStatus === 'pending' && newStatus !== 'pending') {
    bashExpanded.value = false
  }
})

/** Delegate 工具参数 */
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

/** 从 delegate 结果中解析出的元数据 */
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

/** 从 delegate 结果中提取 deltas（用于恢复历史状态） */
const delegateDeltasFromResult = computed((): Array<{ type: 'text' | 'reasoning' | 'tool_start' | 'tool_result', content: string, toolName?: string, isError?: boolean }> => {
  if (!isDelegate.value)
    return []
  const raw = props.tool.result?.result
  if (!raw || typeof raw !== 'object')
    return []
  const deltas = (raw as { deltas?: Array<{ type: string, content: string, toolName?: string, isError?: boolean }> }).deltas ?? []
  // 验证并转换类型
  return deltas.filter((d): d is { type: 'text' | 'reasoning' | 'tool_start' | 'tool_result', content: string, toolName?: string, isError?: boolean } =>
    ['text', 'reasoning', 'tool_start', 'tool_result'].includes(d.type),
  )
})

/** 已完成的 ask_question 工具的结构化问答结果 */
const questionResultPairs = computed<Array<{ question: string, answer: string }> | null>(() => {
  if (!isAskQuestion.value)
    return null
  if (props.tool.status !== 'completed' && props.tool.status !== 'error' && props.tool.status !== 'interrupted')
    return null
  const raw = props.tool.result?.result
  if (!raw || typeof raw !== 'string')
    return null
  // 解析 "- 问题：\n回答" 格式
  const pairs: Array<{ question: string, answer: string }> = []
  const blocks = raw.split(RE_DOUBLE_NEWLINE).filter(Boolean)
  for (const block of blocks) {
    const match = block.match(RE_QUESTION_ANSWER_BLOCK)
    if (match) {
      pairs.push({ question: match[1]!, answer: match[2]!.trim() })
    }
  }
  return pairs.length > 0 ? pairs : null
})

/** Whether to hide the compact summary row (tool has its own result display) */
const hideSummary = computed(() => toolsWithOutputWidget.has(props.tool.toolCall.toolName)
  && (props.tool.status === 'completed' || props.tool.status === 'error' || props.tool.status === 'interrupted'))

const hideSummaryByTool = computed(() => toolsHideSummaryRow.has(props.tool.toolCall.toolName))

const shouldHideSummary = computed(() => hideSummary.value || hideSummaryByTool.value)

/** Whether this tool uses a custom inline output widget */
const hasOutputWidget = computed(() => toolsWithOutputWidget.has(props.tool.toolCall.toolName))

/** Whether to show the terminal output block (registered + has data) */
const hasTerminalOutput = computed(() => hasOutputWidget.value && !!props.tool.output)

/** The terminal output text to display */
const terminalOutput = computed(() => props.tool.output || '')

/** Bash 命令（用于在终端顶部显示） */
const bashCommand = computed(() => {
  if (props.tool.toolCall.toolName !== 'bash')
    return null
  return String(props.tool.toolCall.args.command ?? '')
})

/** 带命令前缀的完整终端输出 */
const terminalDisplayContent = computed(() => {
  const cmd = bashCommand.value
  if (!cmd)
    return terminalOutput.value
  return `$ ${cmd}\n\n${terminalOutput.value}`
})

/** Whether the tool is still running (streaming output) */
const isToolRunning = computed(() => {
  return hasOutputWidget.value && props.tool.status === 'pending'
})

// Auto-scroll terminal to bottom when output changes
watch(terminalOutput, () => {
  nextTick(() => {
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  })
})

watch(bashExpanded, (expanded) => {
  if (expanded) {
    nextTick(() => {
      if (terminalRef.value) {
        terminalRef.value.scrollTop = terminalRef.value.scrollHeight
      }
    })
  }
})
</script>

<template>
  <div v-if="!isSilentTool" :class="compact ? 'my-0.5 text-sm' : 'my-2 text-sm'">
    <!-- ===== ACP compact mode ===== -->
    <template v-if="compact">
      <DelegateCard
        v-if="acpDelegateDeltas.length > 0"
        :tool-call-id="tool.toolCall.toolCallId"
        :agent-name="tool.toolCall.toolName"
        :agent-type="tool.toolCall.toolName"
        :task="acpSummary"
        :status="acpDelegateStatus"
        :deltas="acpDelegateDeltas"
        class="mt-1"
      />
      <template v-else>
        <div
          class="flex items-center gap-1.5 text-muted-foreground cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
          @click="modalOpen = true"
        >
          <div class="h-3 w-3 flex-shrink-0" :class="[statusIcon, statusIconClass]" />
          <code class="text-xs font-mono text-foreground/80">{{ tool.toolCall.toolName }}</code>
          <span v-if="acpSummary" class="text-xs font-mono truncate">{{ acpSummary }}</span>
        </div>
        <div
          v-if="tool.output && tool.status === 'pending'"
          class="ml-5 mt-0.5 text-[10px] font-mono text-muted-foreground/60 truncate"
        >
          {{ tool.output.trim().split('\n').at(-1) }}
        </div>
      </template>
    </template>

    <!-- ===== Normal mode ===== -->
    <template v-else>
      <!-- Awaiting approval: card style with inline buttons -->
      <div
        v-if="tool.status === 'awaiting-approval'"
        class="rounded-lg border border-border bg-muted/30"
      >
        <!-- Clickable header -->
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
          @click="modalOpen = true"
        >
          <div class="i-carbon-warning-alt h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <code class="text-xs font-mono font-medium text-foreground">{{ tool.toolCall.toolName }}</code>
          <span class="text-xs text-muted-foreground font-mono truncate">
            <slot name="summary" v-bind="slotProps">
              {{ defaultSummary }}
            </slot>
          </span>
          <span class="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal flex-shrink-0">
            等待确认
          </span>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-2 px-3 py-2 border-t border-border">
          <button
            class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-neutral-600 hover:bg-neutral-500 dark:bg-neutral-300 dark:hover:bg-neutral-400 text-background transition-colors duration-150"
            @click.stop="emit('approve', tool.toolCall.toolCallId)"
          >
            <div class="i-carbon-checkmark h-3 w-3" />
            允许执行
          </button>
          <div ref="whitelistPopoverRef" class="relative">
            <button
              class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
              @click.stop="whitelistOpen = !whitelistOpen"
            >
              <div class="i-carbon-filter h-3 w-3" />
              加入白名单
            </button>
            <!-- Whitelist Popover -->
            <div
              v-if="whitelistOpen"
              class="absolute left-0 bottom-full mb-1 z-[999]"
            >
              <WhitelistPopover
                :tool-name="tool.toolCall.toolName"
                :args="tool.toolCall.args"
                :suggested-pattern="suggestedPattern"
                :risk-level="riskLevel"
                @confirm="(payload) => { whitelistOpen = false; emit('whitelist', tool.toolCall.toolCallId, payload) }"
                @cancel="whitelistOpen = false"
              />
            </div>
          </div>
          <button
            class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
            @click.stop="emit('reject', tool.toolCall.toolCallId)"
          >
            <div class="i-carbon-close h-3 w-3" />
            拒绝
          </button>
        </div>

        <!-- Inline diff for awaiting-approval -->
        <div
          v-if="inlineDiff"
          class="border-t border-border rounded-b-lg overflow-hidden"
        >
          <div
            class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/50 transition-colors"
            @click="diffExpanded = !diffExpanded"
          >
            <div class="i-carbon-code h-3 w-3 flex-shrink-0 text-muted-foreground" />
            <code class="text-xs font-mono text-muted-foreground truncate">{{ inlineDiffFilePath }}</code>
            <div
              class="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down flex-shrink-0"
              :class="[diffExpanded ? 'rotate-180' : '']"
            />
          </div>
          <div v-show="diffExpanded" class="max-h-[400px] overflow-y-auto border-t border-border">
            <DiffViewer :patch="inlineDiff" :file-path="inlineDiffFilePath" />
          </div>
        </div>
      </div>

      <!-- Awaiting question: question card -->
      <QuestionCard
        v-else-if="tool.status === 'awaiting-question' && isAskQuestion && questionData"
        :tool-call-id="tool.toolCall.toolCallId"
        :questions="questionData.questions"
        @submit="(toolCallId, answers) => emit('questionAnswer', toolCallId, answers)"
      />

      <!-- Bash: collapsible card -->
      <div
        v-else-if="isBash"
        class="rounded-lg border border-border overflow-hidden"
      >
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-muted/50 transition-colors"
          @click="bashExpanded = !bashExpanded"
        >
          <div
            class="h-3 w-3 flex-shrink-0"
            :class="[statusIcon, statusIconClass]"
          />
          <code class="text-xs font-mono text-muted-foreground truncate">{{ bashCommand }}</code>
          <div
            class="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down flex-shrink-0"
            :class="[bashExpanded ? 'rotate-180' : '']"
          />
        </div>
        <template v-if="bashExpanded">
          <div
            v-if="terminalOutput"
            ref="terminalRef"
            class="max-h-[300px] overflow-y-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all bg-neutral-100 dark:bg-[#1a1a2e] text-[#3d2b1f] dark:text-[#e0e0e0]"
          >
            {{ terminalOutput }}
          </div>
          <div
            v-if="isToolRunning"
            class="flex items-center gap-1.5 px-3 py-1 border-t border-border/30 text-[10px] text-[#a08060] dark:text-[#888]"
          >
            <div class="i-svg-spinners:90-ring-with-bg h-3 w-3" />
            <span>执行中...</span>
          </div>
        </template>
      </div>

      <!-- Other states: compact inline (hidden when tool has its own result display) -->
      <div
        v-else-if="!shouldHideSummary"
        class="flex items-center gap-1.5 text-muted-foreground cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-muted/50 transition-colors"
        @click="modalOpen = true"
      >
        <div
          class="h-3 w-3 flex-shrink-0"
          :class="[statusIcon, statusIconClass]"
        />
        <code class="text-xs font-mono">{{ tool.toolCall.toolName }}</code>
        <span class="text-xs font-mono truncate">
          <slot name="summary" v-bind="slotProps">
            {{ defaultSummary }}
          </slot>
        </span>
      </div>

      <!-- Non-bash terminal output widget -->
      <div
        v-if="hasTerminalOutput && !isBash"
        class="mt-1.5 rounded-md border border-border overflow-hidden bg-neutral-100 dark:bg-[#1a1a2e]"
      >
        <div
          ref="terminalRef"
          class="max-h-[300px] overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-[#3d2b1f] dark:text-[#e0e0e0]"
        >
          {{ terminalDisplayContent }}
        </div>
        <div
          v-if="isToolRunning"
          class="flex items-center gap-1.5 px-3 py-1 border-t border-border/30 text-[10px] text-[#a08060] dark:text-[#888]"
        >
          <div class="i-svg-spinners:90-ring-with-bg h-3 w-3" />
          <span>执行中...</span>
        </div>
      </div>

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

      <!-- Plan card for write_plan tool -->
      <PlanCard
        v-if="isWritePlan && writePlanArgs"
        :filename="writePlanArgs.filename"
        :content="writePlanArgs.content"
        :status="writePlanStatus"
      />

      <!-- Inline diff for completed / error states -->
      <div
        v-if="inlineDiff && tool.status !== 'pending' && tool.status !== 'awaiting-approval'"
        class="mt-1.5 rounded-md border border-border overflow-hidden"
      >
        <div
          class="flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none hover:bg-muted/50 transition-colors"
          @click="diffExpanded = !diffExpanded"
        >
          <div class="i-carbon-code h-3 w-3 flex-shrink-0 text-muted-foreground" />
          <code class="text-xs font-mono text-muted-foreground truncate">{{ inlineDiffFilePath }}</code>
          <div
            class="ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down flex-shrink-0"
            :class="[diffExpanded ? 'rotate-180' : '']"
          />
        </div>
        <div v-show="diffExpanded" class="max-h-[400px] overflow-y-auto border-t border-border">
          <DiffViewer :patch="inlineDiff" :file-path="inlineDiffFilePath" />
        </div>
      </div>

      <!-- Detail modal -->
      <ToolCallModal
        :visible="modalOpen"
        :tool-name="tool.toolCall.toolName"
        :args="tool.toolCall.args"
        :result="tool.result?.result"
        :is-error="tool.result?.isError"
        :status="tool.status"
        :hide-result="hasOutputWidget"
        @close="modalOpen = false"
      />
    </template>

    <!-- Detail modal (shared between compact and normal mode) -->
    <ToolCallModal
      v-if="compact"
      :visible="modalOpen"
      :tool-name="tool.toolCall.toolName"
      :args="tool.toolCall.args"
      :result="tool.result?.result"
      :is-error="tool.result?.isError"
      :status="tool.status"
      @close="modalOpen = false"
    />
  </div>
</template>
