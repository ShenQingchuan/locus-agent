<script setup lang="ts">
import type { DelegateDelta } from '@/stores/chat'
import MarkdownRender from 'markstream-vue'
import { computed, nextTick, ref, watch } from 'vue'
import SubAgentToolCallItem from './SubAgentToolCallItem.vue'

const props = defineProps<{
  toolCallId: string
  agentName: string
  agentType: string
  task: string
  context?: string
  status: 'pending' | 'completed' | 'error'
  deltas: DelegateDelta[]
  iterations?: number
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}>()

const emit = defineEmits<{
  expand: []
  collapse: []
}>()

const isExpanded = ref(false)
const contentRef = ref<HTMLElement | null>(null)

// 使用模型传入的 agentName 直接作为显示名称
// agentType 仅作为内部类型标识，用于确定系统提示词预设

// 状态图标和样式
const statusConfig = computed(() => {
  switch (props.status) {
    case 'pending':
      return {
        icon: 'i-carbon-hourglass',
        iconClass: 'animate-spin text-muted-foreground',
        label: '执行中',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      }
    case 'completed':
      return {
        icon: 'i-carbon-checkmark',
        iconClass: 'text-green-600 dark:text-green-400',
        label: '已完成',
        badgeClass: 'bg-green-500/10 text-green-600 dark:text-green-400',
      }
    default:
      return {
        icon: 'i-carbon-close',
        iconClass: 'text-destructive',
        label: '失败',
        badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
      }
  }
})

// 是否有正在进行的工具调用（有 tool_start 但没有 tool_result）
// 注意：如果子代理已完成，即使有未完成的工具调用，也不显示 spinner
const hasPendingToolCall = computed(() => {
  // 子代理已完成，不显示 pending
  if (props.status === 'completed' || props.status === 'error')
    return false
  // 检查最后一个 delta
  const lastDelta = props.deltas[props.deltas.length - 1]
  if (!lastDelta)
    return false
  // 如果最后一个是 tool_start，说明有正在进行的调用
  return lastDelta.type === 'tool_start'
})

// 按顺序处理 deltas，构建用于渲染的条目列表
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
        if (currentTool) {
          // 上一个工具没有收到 result，先 flush 它
          items.push({ type: 'tool', ...currentTool })
        }
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

  // Flush any remaining content
  flushTool()
  flushReasoning()
  flushText()

  return items
})

// 统计工具调用数量（用于 header 显示）
const toolCallCount = computed(() => {
  return timelineItems.value.filter(i => i.type === 'tool').length
})

// 是否有工具调用
const hasToolCalls = computed(() => toolCallCount.value > 0)

// 格式化 token 数量
function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return String(count)
}

// 切换展开/收起
function toggleExpand() {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    emit('expand')
  }
  else {
    emit('collapse')
  }
}

// 用户是否正在手动滚动
const isUserScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | null = null

// 处理滚动事件
function handleScroll() {
  isUserScrolling.value = true
  if (scrollTimeout) {
    clearTimeout(scrollTimeout)
  }
  scrollTimeout = setTimeout(() => {
    isUserScrolling.value = false
  }, 1000)
}

// 流式内容自动滚动（仅在用户没有手动滚动时）
watch(() => props.deltas.length, () => {
  if (isExpanded.value && !isUserScrolling.value) {
    nextTick(() => {
      if (contentRef.value) {
        contentRef.value.scrollTop = contentRef.value.scrollHeight
      }
    })
  }
})
</script>

<template>
  <div class="rounded-lg border border-border bg-muted/30 overflow-hidden">
    <!-- Header: 代理信息和状态 -->
    <div
      class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
      @click="toggleExpand"
    >
      <!-- 代理名称和任务 -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">{{ agentName }}</span>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            :class="statusConfig.badgeClass"
          >
            {{ statusConfig.label }}
          </span>
        </div>
        <div class="text-xs text-muted-foreground truncate mt-0.5">
          {{ task }}
        </div>
      </div>

      <!-- 右侧: 展开图标 -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <div
          class="h-4 w-4 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down"
          :class="[isExpanded ? 'rotate-180' : '']"
        />
      </div>
    </div>

    <!-- Expanded Content -->
    <div
      v-if="isExpanded"
      class="border-t border-border max-h-[500px] flex flex-col"
    >
      <!-- Scrollable Content Area -->
      <div
        ref="contentRef"
        class="flex-1 overflow-y-auto min-h-0"
        @scroll="handleScroll"
      >
        <!-- Task Context -->
        <div v-if="context" class="px-3 py-2 border-b border-border/50 bg-muted/20">
          <div class="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            任务上下文
          </div>
          <div class="text-xs text-muted-foreground whitespace-pre-wrap">
            {{ context }}
          </div>
        </div>

        <!-- Timeline: 线性排列的思考、工具调用和文本 -->
        <div class="divide-y divide-border/30">
          <template v-for="(item, idx) in timelineItems" :key="idx">
            <!-- Reasoning -->
            <div v-if="item.type === 'reasoning'" class="px-3 py-2">
              <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
                <div class="i-carbon-idea h-3 w-3" />
                <span>思考过程</span>
              </div>
              <div class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {{ item.content }}
              </div>
            </div>

            <!-- Tool Call -->
            <div v-else-if="item.type === 'tool'" class="px-3 py-2">
              <SubAgentToolCallItem
                :tool-name="item.toolName"
                :input="item.input"
                :output="item.output"
                :is-error="item.isError"
                :parent-completed="status === 'completed' || status === 'error'"
              />
            </div>

            <!-- Text -->
            <div v-else-if="item.type === 'text'" class="px-3 py-3">
              <div class="text-sm text-foreground leading-relaxed">
                <MarkdownRender :content="item.content" />
              </div>
            </div>
          </template>
        </div>

        <!-- Pending tool call indicator (when streaming) -->
        <div v-if="hasPendingToolCall" class="px-3 py-2 border-t border-border/50">
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <div class="i-svg-spinners:bars-fade h-3 w-3" />
            <span>工具执行中...</span>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="timelineItems.length === 0 && status === 'pending'" class="px-3 py-4 text-center">
          <div class="i-carbon-hourglass h-5 w-5 text-muted-foreground/50 mx-auto mb-2 animate-spin" />
          <div class="text-xs text-muted-foreground">
            子代理正在处理中...
          </div>
        </div>
      </div>

      <!-- Stats Footer (Sticky at bottom) -->
      <div v-if="status !== 'pending' && usage" class="px-3 py-2 border-t border-border/50 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground flex-shrink-0">
        <div class="flex items-center gap-2">
          <span v-if="hasToolCalls" class="flex items-center gap-1">
            <div class="i-carbon-tool-box h-3 w-3" />
            <span>{{ toolCallCount }} 个工具调用</span>
          </span>
        </div>
        <div class="flex items-center gap-3">
          <span>输入: {{ formatTokens(usage.inputTokens) }}</span>
          <span>输出: {{ formatTokens(usage.outputTokens) }}</span>
          <span class="font-medium">总计: {{ formatTokens(usage.totalTokens) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
