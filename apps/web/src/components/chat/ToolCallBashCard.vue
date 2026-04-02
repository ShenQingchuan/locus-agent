<script setup lang="ts">
import type { ToolCallState } from '@/composables/useAssistantRuntime'
import { computed, nextTick, ref, watch } from 'vue'
import { toolsWithOutputWidget } from '@/utils/toolSummary'

const props = defineProps<{
  tool: ToolCallState
}>()

const terminalRef = ref<HTMLElement | null>(null)
const bashExpanded = ref(props.tool.status === 'pending')

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

const bashCommand = computed(() => String(props.tool.toolCall.args.command ?? ''))

const terminalOutput = computed(() => props.tool.output || '')

const hasOutputWidget = computed(() => toolsWithOutputWidget.has(props.tool.toolCall.toolName))

const isToolRunning = computed(() => hasOutputWidget.value && props.tool.status === 'pending')

watch(() => props.tool.status, (newStatus, oldStatus) => {
  if (oldStatus === 'pending' && newStatus !== 'pending') {
    bashExpanded.value = false
  }
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
  <div class="rounded-lg border border-border overflow-hidden">
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
</template>
