<script setup lang="ts">
import type { ToolCallState } from '@/stores/chat'
import { computed, nextTick, ref, watch } from 'vue'
import { buildNewFileDiff, buildReplaceDiff } from '@/utils/diff'
import DiffViewer from './DiffViewer.vue'
import ToolCallModal from './ToolCallModal.vue'

const props = defineProps<{
  tool: ToolCallState
}>()

const emit = defineEmits<{
  approve: [toolCallId: string]
  reject: [toolCallId: string]
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

const modalOpen = ref(false)
const terminalRef = ref<HTMLElement | null>(null)

const statusIcon = computed(() => {
  switch (props.tool.status) {
    case 'pending': return 'i-carbon-hourglass'
    case 'awaiting-approval': return 'i-carbon-warning-alt'
    case 'completed': return 'i-carbon-checkmark'
    case 'error': return 'i-carbon-close'
    default: return 'i-carbon-tool-box'
  }
})

const statusIconClass = computed(() => {
  switch (props.tool.status) {
    case 'pending': return 'text-muted-foreground animate-spin'
    case 'error': return 'text-destructive'
    default: return 'text-muted-foreground'
  }
})

/**
 * Tool-specific summary resolvers.
 * Each entry maps a toolName to a function that returns a summary string from args.
 * To add a new tool summary, just add an entry here — no other file needs to change.
 */
const toolSummaryResolvers: Record<string, (args: Record<string, unknown>) => string> = {
  bash: args => String(args.command ?? ''),
  read_file: args => String(args.file_path ?? ''),
  str_replace: args => String(args.file_path ?? ''),
  write_file: args => String(args.file_path ?? ''),
}

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

/** Whether this tool has an inline terminal output widget */
const hasTerminalOutput = computed(() => {
  return props.tool.toolCall.toolName === 'bash' && !!props.tool.output
})

/** The terminal output text to display */
const terminalOutput = computed(() => props.tool.output || '')

/** Whether the bash command is still running (streaming) */
const isBashRunning = computed(() => {
  return props.tool.toolCall.toolName === 'bash' && props.tool.status === 'pending'
})

// Auto-scroll terminal to bottom when output changes
watch(terminalOutput, () => {
  nextTick(() => {
    if (terminalRef.value) {
      terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    }
  })
})
</script>

<template>
  <div class="my-2 text-sm">
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
          class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-neutral-300 hover:bg-neutral-400 text-background transition-colors duration-150"
          @click.stop="emit('approve', tool.toolCall.toolCallId)"
        >
          <div class="i-carbon-checkmark h-3 w-3" />
          允许执行
        </button>
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
        <div class="max-h-[400px] overflow-y-auto">
          <DiffViewer :patch="inlineDiff" :file-path="inlineDiffFilePath" />
        </div>
      </div>
    </div>

    <!-- Other states: compact inline -->
    <div
      v-else
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

    <!-- Bash terminal output widget -->
    <div
      v-if="hasTerminalOutput"
      class="mt-1.5 rounded-md border border-border bg-[#1a1a2e] overflow-hidden"
    >
      <div
        ref="terminalRef"
        class="max-h-[300px] overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed text-[#e0e0e0] whitespace-pre-wrap break-all"
      >
        {{ terminalOutput }}
      </div>
      <div
        v-if="isBashRunning"
        class="flex items-center gap-1.5 px-3 py-1 border-t border-border/30 text-[10px] text-[#888]"
      >
        <div class="i-svg-spinners:bars-fade h-3 w-3" />
        <span>running...</span>
      </div>
    </div>

    <!-- Inline diff for completed / error states -->
    <div
      v-if="inlineDiff && tool.status !== 'pending' && tool.status !== 'awaiting-approval'"
      class="mt-1.5 rounded-md border border-border overflow-hidden"
    >
      <div class="max-h-[400px] overflow-y-auto">
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
      @close="modalOpen = false"
    />
  </div>
</template>
