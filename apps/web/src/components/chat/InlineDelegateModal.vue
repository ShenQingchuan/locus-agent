<script setup lang="ts">
import type { DelegateDelta } from '@univedge/locus-agent-sdk'
import { Modal } from '@univedge/locus-ui'
import MarkdownRender from 'markstream-vue'
import { computed, nextTick, ref, watch } from 'vue'
import SubAgentToolCallItem from './SubAgentToolCallItem.vue'

const props = defineProps<{
  visible: boolean
  agentName: string
  status: 'pending' | 'completed' | 'error'
  deltas: DelegateDelta[]
}>()

const emit = defineEmits<{
  close: []
}>()

const contentRef = ref<HTMLElement | null>(null)
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

function handleScroll() {
  isUserScrolling.value = true
  if (scrollTimeout)
    clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false
  }, 1000)
}

const statusConfig = computed(() => {
  switch (props.status) {
    case 'pending':
      return { icon: 'i-svg-spinners:90-ring-with-bg', iconClass: 'text-muted-foreground', label: '执行中' }
    case 'completed':
      return { icon: 'i-carbon-checkmark', iconClass: 'text-muted-foreground', label: '已完成' }
    default:
      return { icon: 'i-carbon-close', iconClass: 'text-destructive', label: '失败' }
  }
})

const timelineItems = computed(() => {
  const items: Array<
    | { type: 'reasoning', content: string }
    | { type: 'tool', toolName: string, input: string, output?: string, isError?: boolean }
    | { type: 'text', content: string }
  > = []

  let currentReasoning = ''
  let currentText = ''
  let currentTool: { toolName: string, input: string, output?: string, isError?: boolean } | null = null

  function flushReasoning() {
    if (currentReasoning) {
      items.push({ type: 'reasoning', content: currentReasoning })
      currentReasoning = ''
    }
  }
  function flushText() {
    if (currentText) {
      items.push({ type: 'text', content: currentText })
      currentText = ''
    }
  }
  function flushTool() {
    if (currentTool) {
      items.push({ type: 'tool', ...currentTool })
      currentTool = null
    }
  }

  for (const delta of props.deltas) {
    switch (delta.type) {
      case 'reasoning':
        flushTool()
        flushText()
        currentReasoning += delta.content
        break
      case 'tool_start':
        flushReasoning()
        flushText()
        if (currentTool)
          items.push({ type: 'tool', ...currentTool })
        currentTool = { toolName: delta.toolName || 'unknown', input: delta.content }
        break
      case 'tool_result':
        if (currentTool) {
          currentTool.output = delta.content
          currentTool.isError = delta.isError
          flushTool()
        }
        break
      case 'text':
        flushTool()
        flushReasoning()
        currentText += delta.content
        break
    }
  }

  flushTool()
  flushReasoning()
  flushText()

  return items
})

watch(() => props.deltas.length, () => {
  if (!isUserScrolling.value) {
    nextTick(() => {
      if (contentRef.value)
        contentRef.value.scrollTop = contentRef.value.scrollHeight
    })
  }
})
</script>

<template>
  <Modal
    :open="visible"
    max-width="max-w-3xl"
    panel-class="rounded-xl border-white/10 shadow-2xl"
    @close="emit('close')"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-border flex-shrink-0">
      <div class="h-4 w-4 flex-shrink-0" :class="[statusConfig.icon, statusConfig.iconClass]" />
      <span class="text-sm font-mono font-medium text-foreground">{{ agentName }}</span>
      <span class="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal">
        {{ statusConfig.label }}
      </span>
      <button
        class="ml-1 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        @click="emit('close')"
      >
        <div class="i-carbon-close h-4 w-4" />
      </button>
    </div>

    <!-- Content -->
    <div
      ref="contentRef"
      class="overflow-y-auto flex-1 min-h-0"
      @scroll="handleScroll"
    >
      <div v-if="timelineItems.length === 0 && status === 'pending'" class="px-4 py-8 text-center">
        <div class="i-svg-spinners:90-ring-with-bg h-5 w-5 text-muted-foreground mx-auto mb-2" />
        <div class="text-xs text-muted-foreground">
          子代理处理中...
        </div>
      </div>

      <div v-else class="divide-y divide-border/30">
        <template v-for="(item, idx) in timelineItems" :key="idx">
          <!-- Reasoning -->
          <div v-if="item.type === 'reasoning'" class="px-4 py-3">
            <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">
              <div class="i-carbon-idea h-3 w-3" />
              <span>思考过程</span>
            </div>
            <div class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {{ item.content }}
            </div>
          </div>

          <!-- Tool Call -->
          <SubAgentToolCallItem
            v-else-if="item.type === 'tool'"
            :tool-name="item.toolName"
            :input="item.input"
            :output="item.output"
            :is-error="item.isError"
            :parent-completed="status === 'completed' || status === 'error'"
          />

          <!-- Text (streaming markdown) -->
          <div v-else-if="item.type === 'text'" class="px-4 py-3">
            <div class="text-sm text-foreground leading-relaxed">
              <MarkdownRender :content="item.content" />
            </div>
          </div>
        </template>
      </div>
    </div>
  </Modal>
</template>
