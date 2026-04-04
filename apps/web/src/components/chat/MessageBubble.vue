<script setup lang="ts">
import type { ImageAttachmentStripItem } from '@univedge/locus-ui'
import type { QuestionAnswer } from '@/api/chat'
import type { Message } from '@/composables/assistant-runtime'
import { ImageAttachmentStrip, Modal, Tooltip, useToast } from '@univedge/locus-ui'
import { useClipboard } from '@vueuse/core'
import MarkdownRender from 'markstream-vue'
import { computed, ref } from 'vue'
import { useMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useMessageTokens } from '@/composables/useMessageTokens'
import { useReasoningBlockState } from '@/composables/useReasoningBlockState'
import { useRelativeTime } from '@/composables/useRelativeTime'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { getDisplayParts, getToolCallSlice, isLastTextPart } from '@/utils/messageParts'
import ToolCallItem from './ToolCallItem.vue'

const props = defineProps<{
  message: Message
}>()

const chatStore = useChatStore()
const modelSettings = useModelSettingsStore()
const toast = useToast()

const { activeReasoningIdx, isBlockDone, isBlockExpanded, handleReasoningToggle } = useReasoningBlockState(() => props.message)
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

// 删除确认对话框状态
const showDeleteConfirm = ref(false)
const isDeleting = ref(false)

function handleDeleteClick() {
  showDeleteConfirm.value = true
}

function handleCancelDelete() {
  showDeleteConfirm.value = false
}

async function handleConfirmDelete() {
  if (isDeleting.value)
    return
  isDeleting.value = true
  try {
    const success = await chatStore.deleteMessagesFrom(props.message.id)
    if (success) {
      toast.success('消息已删除')
    }
    else {
      toast.error('删除消息失败')
    }
  }
  finally {
    isDeleting.value = false
    showDeleteConfirm.value = false
  }
}

const displayParts = computed(() => getDisplayParts(props.message))

const isACPMessage = computed(() => !!props.message.model?.startsWith('acp/'))

const {
  messageTokens,
  messageTokensText,
  messageTokensTitle,
  assistantModelLabel,
} = useMessageTokens({
  message: () => props.message,
  provider: () => modelSettings.provider,
  modelName: () => modelSettings.modelName,
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
          <!-- 删除按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            title="删除此消息及之后所有消息"
            :disabled="chatStore.isLoading || isDeleting"
            @click="handleDeleteClick"
          >
            <div class="i-carbon-trash-can h-3 w-3" />
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
          <!-- 删除按钮 -->
          <button
            class="opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
            title="删除此消息及之后所有消息"
            :disabled="chatStore.isLoading || isDeleting"
            @click="handleDeleteClick"
          >
            <div class="i-carbon-trash-can h-3 w-3" />
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
              <span>{{ isBlockDone() ? '思考结束' : '思考中...' }}</span>
              <span v-if="isBlockDone() && !isBlockExpanded(partIdx)" class="opacity-0 group-hover/reasoning:opacity-100 transition-opacity duration-150 text-muted-foreground/40">点击展开</span>
              <!-- Spinner only for the actively-receiving block, not for blocks
                   that already have a tool-call after them (ACP pattern) -->
              <span v-if="activeReasoningIdx === partIdx" class="text-muted-foreground/40">
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
              v-for="tool in getToolCallSlice(message, part.toolCallIndex)"
              :key="tool.toolCall.toolCallId"
              :tool="tool"
              :compact="isACPMessage"
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
              :typewriter="isLastTextPart(displayParts, partIdx) && message.isStreaming"
              :code-block-stream="isLastTextPart(displayParts, partIdx) && message.isStreaming"
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

    <!-- Delete confirmation modal -->
    <Modal
      :open="showDeleteConfirm"
      max-width="max-w-sm"
      panel-class="rounded-lg border-white/10 shadow-2xl"
      confirm-on-enter
      @close="handleCancelDelete"
      @confirm="handleConfirmDelete"
    >
      <!-- Content -->
      <div class="p-4 space-y-3">
        <div class="flex items-start gap-2.5">
          <div class="i-carbon-warning-alt text-3xl text-destructive flex-shrink-0 mt-0.5" />
          <p class="text-sm text-muted-foreground leading-snug">
            此操作将删除该消息及其之后的所有消息，<br>
            且无法撤销。确定要删除吗？
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            class="px-2.5 py-1 text-xs font-medium rounded border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
            :disabled="isDeleting"
            @click="handleCancelDelete"
          >
            取消
          </button>
          <button
            class="px-2.5 py-1 text-xs font-medium rounded bg-destructive hover:bg-destructive/90 text-white transition-colors duration-150 disabled:opacity-50"
            :disabled="isDeleting"
            @click="handleConfirmDelete"
          >
            <span v-if="isDeleting" class="flex items-center gap-1">
              <div class="i-carbon-circle-dash animate-spin h-3 w-3" />
              删除中...
            </span>
            <span v-else>删除</span>
          </button>
        </div>
      </div>
    </Modal>
  </article>
</template>
