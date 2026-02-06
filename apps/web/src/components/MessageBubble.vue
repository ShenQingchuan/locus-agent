<script setup lang="ts">
import type { Message, MessagePart, ToolCallState } from '@/stores/chat'
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useChatStore } from '@/stores/chat'
import ShikiCode from './ShikiCode.vue'
import Tooltip from './Tooltip.vue'

const props = defineProps<{
  message: Message
}>()

const chatStore = useChatStore()

const isUser = computed(() => props.message.role === 'user')
const { relative: relativeTime, absolute: absoluteTime } = useRelativeTime(
  () => props.message.timestamp,
)

function formatToolArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2)
  }
  catch {
    return String(args)
  }
}

function formatToolResult(result: unknown): string {
  if (typeof result === 'string')
    return result

  try {
    return JSON.stringify(result, null, 2)
  }
  catch {
    return String(result)
  }
}

function getToolStatusIcon(tool: ToolCallState): string {
  switch (tool.status) {
    case 'pending':
      return 'i-carbon-hourglass'
    case 'awaiting-approval':
      return 'i-carbon-warning-alt'
    case 'completed':
      return 'i-carbon-checkmark'
    case 'error':
      return 'i-carbon-close'
    default:
      return 'i-carbon-tool-box'
  }
}

function getToolStatusIconClass(tool: ToolCallState): string {
  switch (tool.status) {
    case 'pending':
      return 'text-muted-foreground animate-spin'
    case 'awaiting-approval':
      return 'text-muted-foreground'
    case 'completed':
      return 'text-muted-foreground'
    case 'error':
      return 'text-destructive'
    default:
      return 'text-muted-foreground'
  }
}

async function handleApprove(toolCallId: string) {
  await chatStore.approveToolExecution(toolCallId)
}

async function handleReject(toolCallId: string) {
  await chatStore.rejectToolExecution(toolCallId)
}

async function handleRetry() {
  await chatStore.retryFromMessage(props.message.id)
}

const displayParts = computed<MessagePart[]>(() => {
  if (props.message.parts && props.message.parts.length > 0)
    return props.message.parts

  // Fallback: tool calls first, then content
  const parts: MessagePart[] = []
  if (props.message.toolCalls?.length) {
    props.message.toolCalls.forEach((_, i) => parts.push({ type: 'tool-call', toolCallIndex: i }))
  }
  if (props.message.content) {
    parts.push({ type: 'text', content: props.message.content })
  }
  return parts
})

function getToolCallSlice(toolCallIndex: number): ToolCallState[] {
  const tool = props.message.toolCalls?.[toolCallIndex]
  return tool ? [tool] : []
}

function isLastTextPart(partIndex: number): boolean {
  for (let i = displayParts.value.length - 1; i >= 0; i--) {
    if (displayParts.value[i]?.type === 'text')
      return i === partIndex
  }
  return false
}
</script>

<template>
  <!-- Typography-based message layout with alignment -->
  <article
    class="py-2"
    :class="isUser ? 'flex justify-end' : ''"
  >
    <!-- User message: right aligned -->
    <template v-if="isUser">
      <div class="max-w-[90%] text-right group">
        <div class="flex items-center gap-1 justify-end">
          <!-- 重试按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="重试"
            :disabled="chatStore.isLoading"
            @click="handleRetry"
          >
            <div class="i-carbon-restart h-3 w-3" />
          </button>
          <Tooltip :content="absoluteTime">
            <span class="text-xs text-muted-foreground/60 mr-2">{{ relativeTime }}</span>
          </Tooltip>
          <span class="text-xs text-muted-foreground block">用户</span>
          <div class="i-carbon-user text-xs text-muted-foreground" />
        </div>
        <div class="prose prose-sm dark:prose-invert max-w-none text-left w-full">
          <MarkdownRender
            :content="message.content"
            custom-id="locus"
          />
        </div>
      </div>
    </template>

    <!-- Assistant message: left aligned -->
    <div v-else class="max-w-full">
      <div class="flex items-center gap-1">
        <div class="i-carbon-bot text-xs text-muted-foreground" />
        <span class="text-xs text-muted-foreground block">助手</span>
        <Tooltip :content="absoluteTime">
          <span class="text-xs text-muted-foreground/60 ml-2">{{ relativeTime }}</span>
        </Tooltip>
      </div>

      <!-- Ordered parts: text and tool calls interleaved -->
      <template v-for="(part, partIdx) in displayParts" :key="partIdx">
        <!-- Tool call part -->
        <template v-if="part.type === 'tool-call'">
          <div
            v-for="tool in getToolCallSlice(part.toolCallIndex)"
            :key="tool.toolCall.toolCallId"
            class="my-4 text-sm"
          >
            <!-- Awaiting approval: card style -->
            <div
              v-if="tool.status === 'awaiting-approval'"
              class="my-2 rounded-lg border border-border bg-muted/30"
            >
              <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
                <div class="i-carbon-warning-alt h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <code class="text-xs font-mono font-medium text-foreground">{{ tool.toolCall.toolName }}</code>
                <span class="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal">
                  等待确认
                </span>
              </div>

              <div class="px-3 py-2">
                <details open>
                  <summary class="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 mb-1">
                    参数
                  </summary>
                  <ShikiCode :code="formatToolArgs(tool.toolCall.args)" lang="json" />
                </details>
              </div>

              <div class="flex items-center gap-2 px-3 py-2 border-t border-border">
                <button
                  class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md bg-neutral-300 hover:bg-neutral-400 text-background transition-colors duration-150"
                  @click="handleApprove(tool.toolCall.toolCallId)"
                >
                  <div class="i-carbon-checkmark h-3 w-3" />
                  允许执行
                </button>
                <button
                  class="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
                  @click="handleReject(tool.toolCall.toolCallId)"
                >
                  <div class="i-carbon-close h-3 w-3" />
                  拒绝
                </button>
              </div>
            </div>

            <!-- Other states: compact inline -->
            <template v-else>
              <div class="flex items-center gap-1.5 text-muted-foreground">
                <div
                  class="h-3 w-3 flex-shrink-0"
                  :class="[getToolStatusIcon(tool), getToolStatusIconClass(tool)]"
                />
                <code class="text-xs font-mono">{{ tool.toolCall.toolName }}</code>
                <span
                  v-if="tool.status === 'pending'"
                  class="text-xs"
                >
                  执行中...
                </span>
              </div>

              <details class="mt-0.5 ml-4">
                <summary class="cursor-pointer my-2 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-150 outline-none">
                  参数
                </summary>
                <ShikiCode class="mt-0.5" :code="formatToolArgs(tool.toolCall.args)" lang="json" />
              </details>

              <details
                v-if="tool.result"
                class="mt-0.5 ml-4"
                open
              >
                <summary class="cursor-pointer my-2 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors duration-150 outline-none">
                  结果
                </summary>
                <ShikiCode class="mt-0.5" :code="formatToolResult(tool.result.result)" :lang="tool.result.isError ? 'text' : 'json'" />
              </details>
            </template>
          </div>
        </template>

        <!-- Text part -->
        <div
          v-else-if="part.type === 'text' && part.content"
          class="prose prose-sm dark:prose-invert max-w-none w-full"
        >
          <MarkdownRender
            :content="part.content"
            custom-id="locus"
            :typewriter="isLastTextPart(partIdx) && message.isStreaming"
            :code-block-stream="isLastTextPart(partIdx) && message.isStreaming"
          />
          <div
            v-if="isLastTextPart(partIdx) && message.isStreaming"
            class="inline-block mt-2 ml-0.5"
          >
            <div class="i-svg-spinners:bars-fade mt-4 text-foreground/70" />
          </div>
        </div>
      </template>

      <!-- Empty streaming placeholder -->
      <div
        v-if="message.isStreaming && displayParts.length === 0"
        class="flex items-center gap-1"
      >
        <div class="i-svg-spinners:bars-fade mt-4 text-muted-foreground/70" />
      </div>
    </div>
  </article>
</template>
