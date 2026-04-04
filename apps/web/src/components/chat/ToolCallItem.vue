<script setup lang="ts">
import type { RiskLevel } from '@univedge/locus-agent-sdk'
import type { QuestionAnswer } from '@/api/chat'
import type { ToolCallState } from '@/composables/useAssistantRuntime'
import DiffViewer from '@/components/code/DiffViewer.vue'
import { useToolCallItem } from '@/composables/useToolCallItem'
import DelegateCard from './DelegateCard.vue'
import InlineDelegateModal from './InlineDelegateModal.vue'
import PlanCard from './PlanCard.vue'
import QuestionCard from './QuestionCard.vue'
import ToolCallBashCard from './ToolCallBashCard.vue'
import ToolCallModal from './ToolCallModal.vue'
import WhitelistPopover from './WhitelistPopover.vue'

const props = defineProps<{
  tool: ToolCallState
  suggestedPattern?: string
  riskLevel?: RiskLevel
  questionData?: {
    questions: Array<{ question: string, options: string[], multiple?: boolean }>
  }
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

const {
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
  tool,
  suggestedPattern,
  riskLevel,
  questionData,
  compact,
} = useToolCallItem(props, emit)
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

      <!-- Bash: collapsible card (delegated to ToolCallBashCard) -->
      <ToolCallBashCard
        v-else-if="isBash"
        :tool="tool"
      />

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
          {{ terminalOutput }}
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
