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

// 收集所有文本内容
const textContent = computed(() => {
  return props.deltas
    .filter(d => d.type === 'text')
    .map(d => d.content)
    .join('')
})

// 收集思考过程
const reasoningContent = computed(() => {
  return props.deltas
    .filter(d => d.type === 'reasoning')
    .map(d => d.content)
    .join('')
})

// 收集工具调用历史
const toolCalls = computed(() => {
  const calls: Array<{ toolName: string, input: string, output?: string, isError?: boolean }> = []
  let currentCall: { toolName: string, input: string, output?: string, isError?: boolean } | null = null

  for (const delta of props.deltas) {
    if (delta.type === 'tool_start' && delta.toolName) {
      if (currentCall) {
        calls.push(currentCall)
      }
      currentCall = { toolName: delta.toolName, input: delta.content }
    }
    else if (delta.type === 'tool_result' && currentCall) {
      currentCall.output = delta.content
      currentCall.isError = delta.isError
      calls.push(currentCall)
      currentCall = null
    }
  }

  if (currentCall) {
    calls.push(currentCall)
  }

  return calls
})

const hasToolCalls = computed(() => toolCalls.value.length > 0)
const hasTextContent = computed(() => textContent.value.length > 0)
const hasReasoning = computed(() => reasoningContent.value.length > 0)

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

// 工具调用区域展开状态
const isToolCallsExpanded = ref(true)

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

        <!-- Reasoning Process -->
        <div v-if="hasReasoning" class="px-3 py-2 border-b border-border/50">
          <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
            <div class="i-carbon-idea h-3 w-3" />
            <span>思考过程</span>
          </div>
          <div class="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {{ reasoningContent }}
          </div>
        </div>

        <!-- Tool Calls History -->
        <div v-if="hasToolCalls" class="border-b border-border/50">
          <!-- 可点击的 Header -->
          <div
            class="px-3 py-2 bg-muted/20 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground/70 cursor-pointer hover:bg-muted/30 transition-colors"
            @click="isToolCallsExpanded = !isToolCallsExpanded"
          >
            <div class="flex items-center gap-1.5">
              <div class="i-carbon-tool-box h-3 w-3" />
              <span>工具调用 ({{ toolCalls.length }})</span>
              <!-- Loading spinner -->
              <div
                v-if="hasPendingToolCall"
                class="i-svg-spinners:bars-fade h-3 w-3 text-amber-500"
              />
            </div>
            <div
              class="h-3.5 w-3.5 transition-transform duration-200 i-carbon-chevron-down"
              :class="[isToolCallsExpanded ? 'rotate-180' : '']"
            />
          </div>
          <!-- 工具调用列表 -->
          <div v-show="isToolCallsExpanded" class="divide-y divide-border/30">
            <SubAgentToolCallItem
              v-for="(call, idx) in toolCalls"
              :key="idx"
              :tool-name="call.toolName"
              :input="call.input"
              :output="call.output"
              :is-error="call.isError"
              :parent-completed="status === 'completed' || status === 'error'"
            />
          </div>
        </div>

        <!-- Text Output -->
        <div v-if="hasTextContent" class="px-3 py-3">
          <div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
            <div class="i-carbon-text-align-left h-3 w-3" />
            <span>执行结果</span>
          </div>
          <div class="text-sm text-foreground leading-relaxed">
            <MarkdownRender :content="textContent" />
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="!hasTextContent && !hasReasoning && !hasToolCalls && status === 'pending'" class="px-3 py-4 text-center">
          <div class="i-carbon-hourglass h-5 w-5 text-muted-foreground/50 mx-auto mb-2 animate-spin" />
          <div class="text-xs text-muted-foreground">
            子代理正在处理中...
          </div>
        </div>
      </div>

      <!-- Stats Footer (Sticky at bottom) -->
      <div v-if="status !== 'pending' && usage" class="px-3 py-2 border-t border-border/50 bg-muted/20 flex items-center justify-end text-[10px] text-muted-foreground flex-shrink-0">
        <div class="flex items-center gap-3">
          <span>输入: {{ formatTokens(usage.inputTokens) }}</span>
          <span>输出: {{ formatTokens(usage.outputTokens) }}</span>
          <span class="font-medium">总计: {{ formatTokens(usage.totalTokens) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
