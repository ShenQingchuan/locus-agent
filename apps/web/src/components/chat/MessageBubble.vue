<script setup lang="ts">
import type { ImageAttachmentStripItem } from '@locus-agent/ui'
import type { QuestionAnswer } from '@/api/chat'
import type { Message, MessagePart, ToolCallState } from '@/composables/useAssistantRuntime'
import { DEFAULT_MODELS } from '@locus-agent/agent-sdk'
import { ImageAttachmentStrip, Tooltip, useToast } from '@locus-agent/ui'
import { useClipboard } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'
import { computed, reactive, watch } from 'vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useChatStore } from '@/stores/chat'
import { countTextTokens, countUnknownTokens } from '@/utils/tokenizer'
import ToolCallItem from './ToolCallItem.vue'

const props = defineProps<{
  message: Message
}>()

const chatStore = useChatStore()
const toast = useToast()

// 每个 reasoning 块独立的展开/折叠状态
// - 思考中自动展开，思考一结束（后续出现非 reasoning 的 part）立即自动折叠
// - 用户手动操作后该块不再自动折叠
const expandedBlocks = reactive(new Set<number>())
const userToggledBlocks = reactive(new Set<number>())

// 当前仍在生成中的 reasoning 块索引（parts 末尾的 reasoning）
const activeReasoningIdx = computed<number | null>(() => {
  if (!props.message.isStreaming)
    return null
  const parts = props.message.parts
  if (!parts || parts.length === 0)
    return null
  const lastIdx = parts.length - 1
  return parts[lastIdx]?.type === 'reasoning' ? lastIdx : null
})

watch(activeReasoningIdx, (newIdx, oldIdx) => {
  if (oldIdx != null && oldIdx !== newIdx && !userToggledBlocks.has(oldIdx))
    expandedBlocks.delete(oldIdx)
  if (newIdx != null && newIdx !== oldIdx) {
    expandedBlocks.add(newIdx)
    userToggledBlocks.delete(newIdx)
  }
}, { immediate: true })

function isBlockDone(partIdx: number): boolean {
  if (!props.message.isStreaming)
    return true
  const parts = props.message.parts
  return !parts || partIdx + 1 < parts.length
}

function isBlockExpanded(partIdx: number): boolean {
  return expandedBlocks.has(partIdx)
}

function handleReasoningToggle(partIdx: number) {
  userToggledBlocks.add(partIdx)
  if (expandedBlocks.has(partIdx)) {
    expandedBlocks.delete(partIdx)
  }
  else {
    expandedBlocks.add(partIdx)
  }
}
const markDirty = useMarkConversationDirty()

const isUser = computed(() => props.message.role === 'user')
const isEditing = computed(() => chatStore.editingMessageId === props.message.id)
const { relative: relativeTime, absolute: absoluteTime } = useRelativeTime(
  () => props.message.timestamp,
)

async function handleApprove(toolCallId: string) {
  const autoApprovedCount = chatStore.yoloMode
    ? Math.max(chatStore.pendingApprovals.size - 1, 0)
    : 0
  const approved = await chatStore.approveToolExecution(toolCallId)

  if (approved && autoApprovedCount > 0) {
    toast.success(`已开启 YOLO，并自动通过本会话另外 ${autoApprovedCount} 个等待审批`)
  }
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

async function handleDelegateResume(payload: { taskId: string, agentType: string, agentName: string }) {
  const prompt = [
    `继续之前的子任务：${payload.agentName}（${payload.agentType}）`,
    `task_id: ${payload.taskId}`,
    '请基于现有上下文继续推进，并优先复用该 task_id。',
  ].join('\n')

  const conversationId = await chatStore.sendMessage(prompt)
  if (conversationId) {
    markDirty(conversationId)
  }
}

function getQuestionData(toolCallId: string) {
  const pending = chatStore.pendingQuestions.get(toolCallId)
  if (pending) {
    return { questions: pending.questions }
  }
  return undefined
}

async function handleRetry() {
  const conversationId = await chatStore.retryFromMessage(props.message.id)
  if (conversationId) {
    markDirty(conversationId)
  }
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

const fullTextContent = computed(() => {
  const parts = displayParts.value
    .filter(p => p.type === 'text' && p.content)
    .map(p => (p as { type: 'text', content: string }).content)
  return parts.join('\n\n') || props.message.content
})

const attachmentStripItems = computed<ImageAttachmentStripItem[]>(() => (props.message.attachments ?? []).map(attachment => ({
  id: attachment.id,
  src: attachment.dataUrl,
  name: attachment.name,
  alt: attachment.name,
})))

const { copy, copied } = useClipboard()
</script>

<template>
  <article class="py-2">
    <!-- User message -->
    <template v-if="isUser">
      <div
        class="max-w-full group rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors duration-200"
        :class="isEditing ? 'bg-yellow-400/15 dark:bg-yellow-500/20' : ''"
      >
        <div class="flex items-center gap-1">
          <div class="i-carbon-user text-xs text-muted-foreground" />
          <span class="text-xs text-muted-foreground block">用户</span>
          <Tooltip :content="absoluteTime">
            <span class="text-xs text-muted-foreground/60 ml-2">{{ relativeTime }}</span>
          </Tooltip>
          <!-- Token count (hover only) -->
          <span
            v-if="messageTokens !== null"
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-xs text-muted-foreground/50 ml-1"
            :title="messageTokensTitle"
          >
            {{ messageTokensText }}
          </span>
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
          <!-- 复制按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            :title="copied ? '已复制' : '复制全文'"
            @click="copy(fullTextContent)"
          >
            <div :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" class="h-3 w-3" />
          </button>
        </div>

        <div class="mt-1">
          <div v-if="attachmentStripItems.length > 0" class="my-2">
            <div class="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <div class="i-carbon:image-copy h-3.5 w-3.5" />
              <span>已附带 {{ attachmentStripItems.length }} 张图片</span>
            </div>
            <ImageAttachmentStrip
              :images="attachmentStripItems"
              size="sm"
            />
          </div>
          <div class="prose prose-sm dark:prose-invert max-w-none w-full">
            <MarkdownRender
              :content="message.content"
              custom-id="locus"
            />
          </div>
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
          <!-- 复制按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            :title="copied ? '已复制' : '复制全文'"
            @click="copy(fullTextContent)"
          >
            <div :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" class="h-3 w-3" />
          </button>
        </div>

        <!-- Ordered parts: reasoning, text and tool calls interleaved -->
        <template v-for="(part, partIdx) in displayParts" :key="partIdx">
          <!-- Reasoning/Thinking part -->
          <div
            v-if="part.type === 'reasoning' && part.content"
            class="my-2 group/reasoning"
          >
            <div
              class="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground/70 select-none py-1"
              @click="handleReasoningToggle(partIdx)"
            >
              <div class="i-carbon-idea h-3 w-3" />
              <span>{{ isBlockDone(partIdx) ? '思考结束' : '思考过程' }}</span>
              <span v-if="isBlockDone(partIdx) && !isBlockExpanded(partIdx)" class="opacity-0 group-hover/reasoning:opacity-100 transition-opacity duration-150 text-muted-foreground/40">点击展开</span>
              <span v-if="!isBlockDone(partIdx)" class="text-muted-foreground/40">
                <div class="i-carbon-circle-dash animate-spin h-3 w-3" />
              </span>
            </div>
            <div
              v-show="isBlockExpanded(partIdx)"
              class="ml-1.25 mt-1 pl-4 border-l border-border/90 text-sm text-muted-foreground/70 leading-relaxed whitespace-pre-wrap"
            >
              {{ part.content }}
            </div>
          </div>

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
              @delegate-resume="handleDelegateResume"
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
