<script setup lang="ts">
import type { QuestionAnswer } from '@/api/chat'
import type { Message, MessagePart, ToolCallState } from '@/stores/chat'
import { DEFAULT_MODELS } from '@locus-agent/shared'
import { Tooltip } from '@locus-agent/ui'
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useChatStore } from '@/stores/chat'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'
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

async function handleWhitelist(toolCallId: string, payload: { pattern?: string, scope: 'session' | 'global' }) {
  await chatStore.approveAndWhitelist(toolCallId, payload)
}

async function handleQuestionAnswer(toolCallId: string, answers: QuestionAnswer[]) {
  await chatStore.submitQuestionAnswer(toolCallId, answers)
}

function getQuestionData(toolCallId: string) {
  const pending = chatStore.pendingQuestions.get(toolCallId)
  if (pending) {
    return { questions: pending.questions }
  }
  return undefined
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

const estimateModelHint = computed(() => {
  if (props.message.role === 'assistant' && props.message.model)
    return props.message.model
  const selectedModel = (chatStore.modelName || DEFAULT_MODELS[chatStore.provider] || '').trim()
  return selectedModel || undefined
})

function estimateTokensFromText(text: string, modelHint?: string): number {
  return countTextTokens(text, modelHint)
}

// Estimate context-window contribution of this message (consistent with ring).
// Includes assistant text, tool calls, AND tool results since they are
// visually part of the same message bubble.
const messageTokens = computed<number | null>(() => {
  const msg = props.message

  if (msg.isStreaming)
    return null

  const hint = estimateModelHint.value

  if (msg.role === 'assistant') {
    // reasoning is NOT sent back as context (messagesToCoreMessages strips it),
    // so only count content + tool calls + tool results here.
    let estimate = estimateTokensFromText(msg.content, hint)
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        estimate += estimateTokensFromText(tc.toolCall.toolCallId, hint)
        estimate += estimateTokensFromText(tc.toolCall.toolName, hint)
        estimate += countUnknownTokens(tc.toolCall.args, hint)
        if (tc.result) {
          estimate += estimateTokensFromText(tc.result.toolCallId, hint)
          estimate += estimateTokensFromText(tc.result.toolName, hint)
          estimate += countUnknownTokens(tc.result.result, hint)
        }
      }
    }
    return estimate > 0 ? estimate : null
  }

  const estimate = estimateTokensFromText(msg.content, hint)
  return estimate > 0 ? estimate : null
})

const isEstimatedTokens = computed(() => {
  if (props.message.isStreaming)
    return false
  return true
})

const messageTokensText = computed(() => {
  if (messageTokens.value === null)
    return null
  return isEstimatedTokens.value
    ? `~${messageTokens.value} tokens`
    : `${messageTokens.value} tokens`
})

const reasoningTokens = computed<number | null>(() => {
  const msg = props.message
  if (msg.role !== 'assistant' || !msg.reasoning)
    return null
  return estimateTokensFromText(msg.reasoning, estimateModelHint.value) || null
})

const messageTokensTitle = computed<string | undefined>(() => {
  const msg = props.message
  if (msg.isStreaming)
    return undefined
  const parts: string[] = ['上下文贡献估算']
  if (reasoningTokens.value) {
    parts.push(`思考: ~${reasoningTokens.value}（不计入上下文）`)
  }
  if (msg.role === 'assistant' && msg.usage) {
    parts.push(`API 用量 — 输出: ${msg.usage.completionTokens} · 输入: ${msg.usage.promptTokens} · 总计: ${msg.usage.totalTokens}`)
  }
  return parts.join(' · ')
})

const assistantModelLabel = computed<string | null>(() => {
  if (props.message.role !== 'assistant')
    return null
  return props.message.model || '未记录模型'
})
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
        class="max-w-[95%] text-right group rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors duration-200"
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
          <!-- Token count (hover only, left of timestamp) -->
          <span
            v-if="messageTokens !== null"
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-muted-foreground/50 mr-1"
            :title="messageTokensTitle"
          >
            {{ messageTokensText }}
          </span>
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
    <template v-else>
      <div class="max-w-full group">
        <div class="flex items-center gap-1">
          <div class="i-carbon-bot text-xs text-muted-foreground" />
          <span class="text-xs text-muted-foreground block">助手</span>
          <Tooltip :content="absoluteTime">
            <span class="text-xs text-muted-foreground/60 ml-2">{{ relativeTime }}</span>
          </Tooltip>
          <span
            v-if="assistantModelLabel"
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-muted-foreground/50 ml-1 font-mono"
          >
            {{ assistantModelLabel }}
          </span>
          <!-- Token count (hover only, right of timestamp) -->
          <span
            v-if="messageTokens !== null"
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-muted-foreground/50 ml-1"
            :title="messageTokensTitle"
          >
            {{ messageTokensText }}
          </span>
        </div>

        <!-- Ordered parts: reasoning, text and tool calls interleaved -->
        <template v-for="(part, partIdx) in displayParts" :key="partIdx">
          <!-- Reasoning/Thinking part -->
          <details
            v-if="part.type === 'reasoning' && part.content"
            class="my-2 group/reasoning"
            :open="message.isStreaming"
          >
            <summary class="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground/70 select-none py-1">
              <div class="i-carbon-idea h-3 w-3" />
              <span>{{ message.isStreaming ? '思考过程' : '思考结束' }}</span>
              <span v-if="!message.isStreaming" class="reasoning-hint opacity-0 group-hover/reasoning:opacity-100 transition-opacity duration-150 text-muted-foreground/40">点击展开思考过程</span>
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
              :suggested-pattern="chatStore.pendingApprovals.get(tool.toolCall.toolCallId)?.suggestedPattern"
              :risk-level="chatStore.pendingApprovals.get(tool.toolCall.toolCallId)?.riskLevel"
              :question-data="getQuestionData(tool.toolCall.toolCallId)"
              @approve="handleApprove"
              @reject="handleReject"
              @whitelist="handleWhitelist"
              @question-answer="handleQuestionAnswer"
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
    </template>
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

/* 展开时隐藏提示文字 */
details[open] .reasoning-hint {
  display: none;
}
</style>
