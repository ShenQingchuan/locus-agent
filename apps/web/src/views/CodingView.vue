<script setup lang="ts">
import type { Conversation, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import { useQueryCache } from '@pinia/colada'
import { useToast } from '@univedge/locus-ui'
import { useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onActivated, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as workspaceApi from '@/api/workspace'
import ChatInput from '@/components/chat/ChatInput.vue'
import ConversationList from '@/components/chat/ConversationList.vue'
import ConversationListItem from '@/components/chat/ConversationListItem.vue'
import MessageList from '@/components/chat/MessageList.vue'
import CommitDialog from '@/components/code/CommitDialog.vue'
import PlanViewer from '@/components/code/PlanViewer.vue'
import SessionChangesPanel from '@/components/code/SessionChangesPanel.vue'
import KanbanBoard from '@/components/kanban/KanbanBoard.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { getConversationListQueryKey, useConversationListQuery, useConversationQuery } from '@/composables/queries'
import { getTasksListQueryKey } from '@/composables/taskQueries'
import { provideMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useGitStatus } from '@/composables/useGitStatus'
import { useResizePanel } from '@/composables/useResizePanel'
import { useChatStore } from '@/stores/chat'
import { useModelSettingsStore } from '@/stores/modelSettings'
import { usePlanStore } from '@/stores/plan'
import { useWorkspaceStore } from '@/stores/workspace'
import { runWithLoadingState } from '@/utils/loadingState'
import { createProjectKey } from '@/utils/projectKey'

defineOptions({ name: 'CodingView' })

type CodingSection = 'chat' | 'planning' | 'workspace'

const activeSection = useLocalStorage<CodingSection>('locus-agent:coding-active-section', 'chat')
const currentProjectKey = ref<string | undefined>()
const isWorkspaceLoading = ref(false)
const kanbanBoardRef = ref<InstanceType<typeof KanbanBoard> | null>(null)
const isHistoryOpen = ref(false)
const isCommitDialogOpen = ref(false)
const isLeftSidebarCollapsed = useLocalStorage('locus-agent:coding-left-sidebar-collapsed', false)
const dirtyConversations = new Set<string>()

const toast = useToast()
const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const modelSettings = useModelSettingsStore()
const planStore = usePlanStore()
const workspaceStore = useWorkspaceStore()
const queryCache = useQueryCache()
const isCodingViewActive = ref(true)
const currentProjectPath = computed(() => workspaceStore.currentWorkspacePath)
const gitStatus = useGitStatus(currentProjectPath, isCodingViewActive)

const STORAGE_KEY_LEFT_PANEL_WIDTH = 'locus-agent:coding-left-panel-width'

function getStoredPanelWidth(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined')
    return fallback

  try {
    const stored = localStorage.getItem(storageKey)
    if (!stored)
      return fallback
    const parsed = Number.parseInt(stored, 10)
    if (Number.isNaN(parsed))
      return fallback
    return Math.max(min, Math.min(max, parsed))
  }
  catch {
    return fallback
  }
}

const leftPanel = useResizePanel({
  initialWidth: getStoredPanelWidth(STORAGE_KEY_LEFT_PANEL_WIDTH, 160, 160, 320),
  minWidth: 160,
  maxWidth: 320,
  onWidthChange: (width) => {
    localStorage.setItem(STORAGE_KEY_LEFT_PANEL_WIDTH, String(width))
  },
})

const {
  width: leftPanelWidth,
  panelRef: leftPanelRef,
  isResizing: isLeftPanelResizing,
  handleMouseDown: handleLeftPanelResizeStart,
} = leftPanel

const codingScope = computed(() => ({
  space: 'coding' as const,
  projectKey: currentProjectKey.value,
  workspaceRoot: workspaceStore.currentWorkspacePath || undefined,
}))

const canUseAssistant = computed(() => !!currentProjectKey.value)
const hasHandledFirstActivation = ref(false)

const isGitStatusUpdating = computed(
  () => activeSection.value === 'workspace'
    && (gitStatus.isLoading.value || gitStatus.isRefreshing.value),
)

provideMarkConversationDirty((conversationId: string) => {
  dirtyConversations.add(conversationId)
})

const { data: conversationsData, isPending: isLoadingConversations } = useConversationListQuery(() => codingScope.value)
const { data: conversationData } = useConversationQuery(() => chatStore.currentConversationId)

watch(codingScope, (scope) => {
  chatStore.setConversationScope(scope)
}, { immediate: true })

// Sync selected conversation → URL query (replace, not push, to avoid history spam)
watch(() => chatStore.currentConversationId, (id) => {
  const q = route.query
  if (id) {
    if (q.conversation !== id)
      router.replace({ query: { ...q, conversation: id } })
  }
  else if (q.conversation) {
    const { conversation: _, ...rest } = q
    router.replace({ query: rest })
  }
})

watch(conversationsData, (data) => {
  if (data) {
    chatStore.conversations = data
  }
}, { immediate: true })

watch(conversationData, (data) => {
  const activeConversationId = chatStore.currentConversationId
  if (!activeConversationId)
    return

  if (data && data.conversation.id !== activeConversationId)
    return

  if (chatStore.isLoading || chatStore.isStreaming)
    return

  if (data) {
    chatStore.applyConversationData(data, activeConversationId)
  }
  else if (data === null) {
    chatStore.newConversation()
  }
})

watch(() => chatStore.currentConversationId, (_newId, oldId) => {
  if (oldId && dirtyConversations.has(oldId)) {
    queryCache.invalidateQueries({ key: ['conversation', oldId] })
    dirtyConversations.delete(oldId)
  }
})

async function initWorkspaceProjectKey() {
  const savedPath = workspaceStore.currentWorkspacePath.trim()
  if (!savedPath) {
    currentProjectKey.value = undefined
    return
  }

  try {
    await runWithLoadingState(isWorkspaceLoading, async () => {
      const result = await workspaceApi.openWorkspace(savedPath)
      const projectKey = await createProjectKey(result.rootPath)
      currentProjectKey.value = projectKey
    })
  }
  catch {
    workspaceStore.closeWorkspace()
    currentProjectKey.value = undefined
  }
}

function refreshCodingDataOnActivate() {
  if (!currentProjectKey.value)
    return

  queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })

  if (chatStore.currentConversationId && !chatStore.isLoading && !chatStore.isStreaming) {
    queryCache.invalidateQueries({ key: ['conversation', chatStore.currentConversationId] })
  }

  queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
}

watch(() => workspaceStore.currentWorkspacePath, async (newPath) => {
  if (newPath.trim()) {
    await initWorkspaceProjectKey()
  }
  else {
    currentProjectKey.value = undefined
  }
})

onMounted(async () => {
  await modelSettings.loadModelSettings()
  await initWorkspaceProjectKey()
  // Restore conversation from URL query after workspace is ready
  await nextTick()
  const conversationId = route.query.conversation as string | undefined
  if (conversationId) {
    chatStore.switchConversation(conversationId)
    activeSection.value = 'chat'
  }
})

onActivated(async () => {
  isCodingViewActive.value = true
  chatStore.setConversationScope(codingScope.value)

  if (!hasHandledFirstActivation.value) {
    hasHandledFirstActivation.value = true
    return
  }

  if (!currentProjectKey.value && workspaceStore.currentWorkspacePath.trim() && !isWorkspaceLoading.value) {
    await initWorkspaceProjectKey()
  }

  refreshCodingDataOnActivate()

  // Refresh git status when change review (变更审阅) is the active section
  if (activeSection.value === 'workspace' && currentProjectKey.value) {
    gitStatus.refresh()
  }
})

onDeactivated(() => {
  isCodingViewActive.value = false
})

async function handleSend(payload: { content: string, attachments: MessageImageAttachment[] }) {
  if ((!payload.content.trim() && payload.attachments.length === 0) || !canUseAssistant.value)
    return

  const targetConversationId = await chatStore.sendMessage(payload.content, undefined, undefined, {
    attachments: payload.attachments,
  })
  if (targetConversationId) {
    dirtyConversations.add(targetConversationId)
  }
  queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })
}

function handleStop() {
  chatStore.stopGeneration()
}

function handleSelectConversation(id: string) {
  chatStore.switchConversation(id)
  activeSection.value = 'chat'
  isHistoryOpen.value = false
}

function toggleHistory() {
  if (!canUseAssistant.value)
    return
  isHistoryOpen.value = !isHistoryOpen.value
}

async function handleDeleteConversation(id: string) {
  const confirmed = await toast.confirm({
    title: '删除对话',
    message: '确定要删除这个对话吗？删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    type: 'error',
  })
  if (!confirmed)
    return

  await chatStore.removeConversation(id)
  queryCache.invalidateQueries({ key: getConversationListQueryKey(codingScope.value) })
  toast.success('对话已删除')
}

async function handleNewConversation() {
  if (!canUseAssistant.value)
    return
  isHistoryOpen.value = false
  await nextTick()
  chatStore.newConversation()
  activeSection.value = 'chat'
}

function handleCommit() {
  isCommitDialogOpen.value = true
}

async function handleCommitConfirm(message: string) {
  isCommitDialogOpen.value = false
  try {
    const result = await gitStatus.commit(message)
    if (result?.success) {
      toast.success('提交成功')
    }
    else {
      toast.error(result?.message || '提交失败')
    }
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '提交失败')
  }
}

async function handlePush() {
  const confirmed = await toast.confirm({
    title: '推送到远程',
    message: '确定要将本地提交推送到远程仓库吗？',
    confirmText: '推送',
    cancelText: '取消',
  })
  if (!confirmed)
    return

  try {
    const result = await gitStatus.push()
    if (result?.success) {
      toast.success('推送成功')
    }
    else {
      toast.error(result?.message || '推送失败')
    }
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '推送失败')
  }
}

async function handleDiscard() {
  const confirmed = await toast.confirm({
    title: '回滚全部变更',
    message: '此操作将撤销所有未提交的变更，且无法恢复。确定继续？',
    confirmText: '回滚',
    cancelText: '取消',
    type: 'error',
  })
  if (!confirmed)
    return

  try {
    const result = await gitStatus.discard()
    if (result?.success) {
      toast.success('已回滚全部变更')
    }
    else {
      toast.error(result?.message || '回滚失败')
    }
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '回滚失败')
  }
}

// Auto-refresh git status when agent finishes streaming
watch(() => chatStore.isStreaming, (cur, prev) => {
  if (prev && !cur) {
    setTimeout(() => gitStatus.refresh(), 500)
    if (currentProjectKey.value) {
      queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
    }
  }
})

const currentProjectConversations = computed<Conversation[]>(() => chatStore.conversations)

const recentConversations = computed(() => {
  if (!canUseAssistant.value)
    return []
  return currentProjectConversations.value.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3)
})

const manageKanbanResultCount = computed(() => {
  return chatStore.messages.reduce((count, message) => {
    if (!message.toolCalls || message.toolCalls.length === 0)
      return count
    return count + message.toolCalls.filter(toolCallState =>
      toolCallState.toolCall.toolName === 'manage_kanban' && !!toolCallState.result,
    ).length
  }, 0)
})

watch(manageKanbanResultCount, (current, previous) => {
  if (current <= previous)
    return
  if (!currentProjectKey.value)
    return
  queryCache.invalidateQueries({ key: getTasksListQueryKey(currentProjectKey.value) })
})
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 min-w-0 flex">
      <!-- Left sidebar: section nav + optional conversation list (chat section) -->
      <aside
        ref="leftPanelRef"
        class="min-w-0 border-r border-border bg-sidebar-background flex flex-col relative"
        :class="[
          isLeftPanelResizing ? '' : 'transition-[width] duration-150',
          isLeftSidebarCollapsed ? 'items-center' : '',
        ]"
        :style="{ width: isLeftSidebarCollapsed ? '48px' : `${leftPanelWidth}px` }"
      >
        <!-- Nav buttons -->
        <div :class="isLeftSidebarCollapsed ? 'p-1.5 space-y-0.5' : 'p-2 space-y-0.5'">
          <!-- 研发对话 -->
          <button
            class="flex items-center rounded transition-colors"
            :class="[
              isLeftSidebarCollapsed
                ? 'h-8 w-8 inline-flex items-center justify-center'
                : 'w-full text-left px-2.5 py-2 text-sm',
              activeSection === 'chat'
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            ]"
            :title="isLeftSidebarCollapsed ? '研发对话' : undefined"
            @click="activeSection = 'chat'; planStore.closePlan()"
          >
            <div v-if="isLeftSidebarCollapsed" class="i-carbon-chat-bot h-4 w-4" />
            <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
              <span class="i-streamline-pixel:coding-apps-websites-android h-4 w-4" />
              研发对话
            </div>
          </button>

          <!-- 变更审阅 -->
          <button
            class="flex items-center rounded transition-colors"
            :class="[
              isLeftSidebarCollapsed
                ? 'h-8 w-8 inline-flex items-center justify-center'
                : 'w-full text-left px-2.5 py-2 text-sm',
              activeSection === 'workspace' && !planStore.viewingPlan
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            ]"
            :title="isLeftSidebarCollapsed ? '变更审阅' : undefined"
            @click="activeSection = 'workspace'; planStore.closePlan()"
          >
            <div v-if="isLeftSidebarCollapsed" class="i-lucide:git-pull-request-arrow h-4 w-4" />
            <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
              <span class="i-lucide:git-pull-request-arrow h-4 w-4" />
              变更审阅
            </div>
          </button>

          <!-- 任务编排 -->
          <button
            class="flex items-center rounded transition-colors"
            :class="[
              isLeftSidebarCollapsed
                ? 'h-8 w-8 inline-flex items-center justify-center'
                : 'w-full text-left px-2.5 py-2 text-sm',
              activeSection === 'planning' && !planStore.viewingPlan
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            ]"
            :title="isLeftSidebarCollapsed ? '任务编排' : undefined"
            @click="activeSection = 'planning'; planStore.closePlan()"
          >
            <div v-if="isLeftSidebarCollapsed" class="i-bi:kanban-fill h-4 w-4" />
            <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
              <span class="i-bi:kanban-fill h-4 w-4" />
              任务编排
            </div>
          </button>
        </div>

        <!-- Collapse / Expand toggle (bottom) -->
        <div class="mt-auto p-2 flex" :class="isLeftSidebarCollapsed ? 'justify-center' : 'justify-end'">
          <button
            class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            :title="isLeftSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="isLeftSidebarCollapsed = !isLeftSidebarCollapsed"
          >
            <span
              class="h-3.5 w-3.5 transition-transform"
              :class="isLeftSidebarCollapsed ? 'i-carbon-chevron-right' : 'i-carbon-chevron-left'"
            />
          </button>
        </div>

        <!-- Resize handle -->
        <div
          v-if="!isLeftSidebarCollapsed"
          class="absolute top-0 -right-1.5 w-3 h-full cursor-col-resize z-10 group/resize"
          style="touch-action: none; user-select: none;"
          @mousedown="handleLeftPanelResizeStart"
        >
          <div
            class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors"
            :class="isLeftPanelResizing ? 'bg-primary/50' : 'bg-transparent group-hover/resize:bg-primary/30'"
          />
        </div>
      </aside>

      <!-- Main panel -->
      <div class="flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <!-- Header -->
        <header class="h-11 flex-shrink-0 border-b border-border px-4 flex items-center justify-between">
          <div class="min-w-0 inline-flex items-center gap-2 px-2 py-1">
            <span class="i-material-symbols:folder-managed h-4 w-4 flex-none text-muted-foreground" />
            <span
              class="max-w-[28rem] truncate text-sm font-sans text-muted-foreground"
              :title="workspaceStore.currentWorkspacePath"
            >
              {{ workspaceStore.currentWorkspaceName }}
            </span>
          </div>

          <div class="flex items-center gap-1">
            <button
              v-if="activeSection === 'planning' && !planStore.viewingPlan"
              class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-1 transition-colors"
              @click="kanbanBoardRef?.openCreate()"
            >
              <div class="i-carbon-add h-4 w-4" />
              <span class="whitespace-nowrap">新建任务</span>
            </button>

            <template v-if="activeSection === 'chat'">
              <button
                class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                :class="{ 'opacity-40 cursor-not-allowed': !canUseAssistant }"
                title="新建会话"
                :disabled="!canUseAssistant"
                @click="handleNewConversation"
              >
                <span class="i-ic:baseline-add h-4 w-4" />
              </button>
              <button
                class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                :class="{
                  'opacity-40 cursor-not-allowed': !canUseAssistant,
                  'bg-muted text-foreground': canUseAssistant && isHistoryOpen,
                }"
                title="项目会话历史"
                :disabled="!canUseAssistant"
                @click="toggleHistory"
              >
                <span class="i-material-symbols:history-rounded h-4 w-4" />
              </button>
            </template>
          </div>
        </header>

        <!-- Plan viewer -->
        <PlanViewer
          v-if="planStore.viewingPlan"
          class="flex-1 min-h-0"
          :filename="planStore.viewingPlan.filename"
          :content="planStore.viewingPlan.content"
          @close="planStore.closePlan()"
        />

        <template v-else>
          <!-- ── 研发对话 section ── -->
          <template v-if="activeSection === 'chat'">
            <div class="flex-1 min-h-0">
              <MessageList
                :messages="chatStore.visibleMessages"
                :is-loading="chatStore.isLoading"
                :is-streaming="chatStore.isStreaming"
                scroll-button-right="calc((100% - min(100%, 48rem)) / 2 + 2rem)"
              >
                <template #empty>
                  <div class="flex-col-center h-full py-16 text-muted-foreground">
                    <div class="i-carbon-chat-bot h-10 w-10 mb-4 opacity-50" />
                    <p class="text-base font-medium">
                      开始对话
                    </p>
                    <p class="text-sm mt-1.5 opacity-70">
                      在下方输入消息开始聊天
                    </p>
                    <div v-if="recentConversations.length > 0" class="w-full max-w-xs mt-8">
                      <div class="flex items-center gap-2 mb-2 px-1">
                        <div class="h-px flex-1 bg-border" />
                        <span class="text-xs text-muted-foreground/70">最近对话</span>
                        <div class="h-px flex-1 bg-border" />
                      </div>
                      <div class="space-y-0.5">
                        <button
                          v-for="conv in recentConversations"
                          :key="conv.id"
                          class="w-full text-left rounded-md px-3 py-2 transition-colors hover:bg-muted"
                          @click="handleSelectConversation(conv.id)"
                        >
                          <ConversationListItem :conversation="conv" />
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </MessageList>
            </div>

            <div
              v-if="chatStore.hasError"
              class="flex-shrink-0 border-t border-destructive/20 bg-destructive/5 px-3.5 py-2.5"
            >
              <div class="flex items-center justify-between">
                <span class="text-xs text-destructive">{{ chatStore.error?.message }}</span>
                <button
                  class="text-xs text-destructive/80 hover:text-destructive transition-colors duration-150 whitespace-nowrap"
                  @click="chatStore.clearError()"
                >
                  关闭
                </button>
              </div>
            </div>

            <div class="px-0 pb-3 flex-shrink-0">
              <ChatInput
                class="px-2"
                :disabled="!canUseAssistant"
                :is-streaming="chatStore.isStreaming"
                :show-bottom-hint="false"
                show-coding-mode
                :workspace-root="workspaceStore.currentWorkspacePath || undefined"
                disabled-placeholder="请选择工作空间后开始项目内对话。"
                @send="handleSend"
                @stop="handleStop"
              />
            </div>
          </template>

          <!-- ── 变更审阅 section ── -->
          <template v-else-if="activeSection === 'workspace'">
            <div
              v-if="isGitStatusUpdating"
              class="git-loading-bar relative h-0.5 w-full flex-shrink-0 overflow-hidden bg-muted"
            >
              <div class="git-loading-bar-inner absolute left-0 h-full w-20 rounded-full bg-primary" />
            </div>
            <div class="flex-1 min-h-0">
              <SessionChangesPanel
                v-if="currentProjectKey"
                :files="gitStatus.files.value"
                :summary="gitStatus.summary.value"
                :is-loading="gitStatus.isLoading.value"
                :is-refreshing="gitStatus.isRefreshing.value"
                :is-git-repo="gitStatus.isGitRepo.value"
                :selected-file-path="gitStatus.selectedFilePath.value"
                :selected-file-staged="gitStatus.selectedFileStaged.value"
                :selected-file-diff="gitStatus.selectedFileDiff.value"
                :is-diff-loading="gitStatus.isDiffLoading.value"
                :unpushed-commits="gitStatus.unpushedCommits.value"
                @select="gitStatus.selectFile"
                @refresh="gitStatus.refresh"
                @commit="handleCommit"
                @push="handlePush"
                @discard="handleDiscard"
                @stage="gitStatus.stage"
                @unstage="gitStatus.unstage"
              />
              <div v-else class="h-full flex items-center justify-center">
                <div class="text-center">
                  <span class="i-material-symbols:folder-managed-outline h-8 w-8 text-muted-foreground/50 mx-auto block mb-2" />
                  <span class="text-sm text-muted-foreground block">请先选择工作空间</span>
                  <span class="text-xs text-muted-foreground/80 block mt-1">点击左下角文件夹图标打开项目</span>
                </div>
              </div>
            </div>
          </template>

          <!-- ── 任务编排 section ── -->
          <template v-else-if="activeSection === 'planning'">
            <div class="flex-1 min-h-0">
              <KanbanBoard
                v-if="currentProjectKey"
                ref="kanbanBoardRef"
                :project-key="currentProjectKey"
                @switch-conversation="handleSelectConversation"
              />
              <div v-else class="h-full flex items-center justify-center">
                <span class="text-xs text-muted-foreground">请先选择工作空间</span>
              </div>
            </div>
          </template>
        </template>

        <!-- History slide-out panel (right overlay, chat section only) -->
        <Transition name="history-panel">
          <div
            v-if="isHistoryOpen && activeSection === 'chat'"
            class="absolute right-0 top-11 bottom-0 w-72 border-l border-border bg-sidebar-background flex flex-col shadow-xl z-20"
          >
            <div class="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
              <span class="text-sm font-medium">项目会话历史</span>
              <button
                class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                @click="isHistoryOpen = false"
              >
                <span class="i-carbon-close h-3.5 w-3.5" />
              </button>
            </div>
            <div class="flex-1 min-h-0 overflow-y-auto">
              <ConversationList
                :conversations="currentProjectConversations"
                :current-id="chatStore.currentConversationId ?? undefined"
                :loading="isLoadingConversations"
                :virtual-scroll="true"
                :item-height="58"
                class="h-full"
                @select="handleSelectConversation"
                @delete="handleDeleteConversation"
              />
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Commit dialog (teleported to body to avoid z-index clipping) -->
    <Teleport to="body">
      <CommitDialog
        v-if="isCommitDialogOpen"
        :staged-count="gitStatus.files.value.filter(f => f.staged).length"
        :workspace-path="workspaceStore.currentWorkspacePath"
        @confirm="handleCommitConfirm"
        @cancel="isCommitDialogOpen = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.git-loading-bar-inner {
  animation: git-swing 1.2s ease-in-out infinite;
}

@keyframes git-swing {
  0%,
  100% {
    left: 0;
  }
  50% {
    left: calc(100% - 5rem);
  }
}

.history-panel-enter-active,
.history-panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.history-panel-enter-from,
.history-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
