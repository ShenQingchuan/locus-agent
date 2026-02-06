<script setup lang="ts">
import type { Message, MessagePart, ToolCallState } from '@/stores/chat'
import { Tooltip } from '@locus-agent/ui'
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useChatStore } from '@/stores/chat'
import ToolCallItem from './ToolCallItem.vue'

const props = defineProps<{
  message: Message
}>()

const chatStore = useChatStore()

const isUser = computed(() => props.message.role === 'user')
const isEditing = computed(() => chatStore.editingMessageId === props.message.id)
const { relative: relativeTime, absolute: absoluteTime } = useRelativeTime(
  () => props.message.timestamp,
)

async function handleApprove(toolCallId: string) {
  await chatStore.approveToolExecution(toolCallId)
}

async function handleReject(toolCallId: string) {
  await chatStore.rejectToolExecution(toolCallId)
}

async function handleRetry() {
  await chatStore.retryFromMessage(props.message.id)
}

function handleEdit() {
  chatStore.startEditMessage(props.message.id)
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
      <div
        class="max-w-[90%] text-right group rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors duration-200"
        :class="isEditing ? 'bg-yellow-400/15 dark:bg-yellow-500/20' : ''"
      >
        <div class="flex items-center gap-1 justify-end">
          <!-- 编辑按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="编辑"
            :disabled="chatStore.isLoading"
            @click="handleEdit"
          >
            <div class="i-carbon-edit h-3 w-3" />
          </button>
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

        <!-- 正常显示 -->
        <div class="prose prose-sm dark:prose-invert max-w-none text-right w-full">
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

      <!-- Ordered parts: reasoning, text and tool calls interleaved -->
      <template v-for="(part, partIdx) in displayParts" :key="partIdx">
        <!-- Reasoning/Thinking part -->
        <details
          v-if="part.type === 'reasoning' && part.content"
          class="my-2"
          :open="message.isStreaming"
        >
          <summary class="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground/70 select-none py-1">
            <div class="i-carbon-idea h-3 w-3" />
            <span>思考过程</span>
          </summary>
          <div class="ml-1.25 mt-1 pl-4 border-l border-border/90 text-sm text-muted-foreground/70 leading-relaxed whitespace-pre-wrap">
            {{ part.content }}
          </div>
        </details>

        <!-- Tool call part -->
        <template v-else-if="part.type === 'tool-call'">
          <ToolCallItem
            v-for="tool in getToolCallSlice(part.toolCallIndex)"
            :key="tool.toolCall.toolCallId"
            :tool="tool"
            @approve="handleApprove"
            @reject="handleReject"
          />
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
        </div>
      </template>

      <!-- Streaming spinner: always at the bottom -->
      <div
        v-if="message.isStreaming"
        class="inline-block mt-2 ml-0.5"
      >
        <div class="i-svg-spinners:bars-fade mt-4 text-foreground/70" />
      </div>
    </div>
  </article>
</template>

<style scoped>
/* 用户消息中的 markdown 内容右对齐 */
.text-right .markstream-vue {
  text-align: right;
}

.text-right .markstream-vue .paragraph-node,
.text-right .markstream-vue .heading-node,
.text-right .markstream-vue .list-node {
  text-align: right;
}
</style>
