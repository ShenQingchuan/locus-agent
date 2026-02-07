<script setup lang="ts">
import type { ToolCallState } from '@/stores/chat'
import { computed, ref } from 'vue'
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
}

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
