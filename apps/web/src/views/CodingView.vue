<script setup lang="ts">
import type {
  Conversation,
  WorkspaceDirectoryEntry,
} from '@locus-agent/shared'
import { DirectoryBrowserModal, useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { useLocalStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import * as workspaceApi from '@/api/workspace'
import ChatInput from '@/components/chat/ChatInput.vue'
import ConversationList from '@/components/chat/ConversationList.vue'
import MessageList from '@/components/chat/MessageList.vue'
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
import { createProjectKey } from '@/utils/projectKey'

type CodingSection = 'planning' | 'workspace'

const activeSection = useLocalStorage<CodingSection>('locus-agent:coding-active-section', 'workspace')
const currentProjectName = ref('未选择工作空间')
const currentProjectPath = ref('')
const isWorkspaceLoading = ref(false)
const isWorkspacePickerOpen = ref(false)
const isWorkspacePickerLoading = ref(false)
const isWorkspacePathLoading = ref(false)
const lastWorkspacePath = useLocalStorage('locus-agent:coding-last-workspace-path', '')
const currentBrowsePath = ref(lastWorkspacePath.value.trim())
const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
const allBrowseEntries = ref<WorkspaceDirectoryEntry[]>([])
const isBrowseTruncated = ref(false)
let browseRequestToken = 0
const currentProjectKey = ref<string | undefined>()
const kanbanBoardRef = ref<InstanceType<typeof KanbanBoard> | null>(null)
const isHistoryOpen = ref(false)
const isLeftSidebarCollapsed = useLocalStorage('locus-agent:coding-left-sidebar-collapsed', false)
const dirtyConversations = new Set<string>()

const toast = useToast()
const chatStore = useChatStore()
const queryCache = useQueryCache()
const gitStatus = useGitStatus(currentProjectPath)

const STORAGE_KEY_LEFT_PANEL_WIDTH = 'locus-agent:coding-left-panel-width'
const STORAGE_KEY_ASSISTANT_WIDTH = 'locus-agent:coding-assistant-width'

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
  initialWidth: getStoredPanelWidth(STORAGE_KEY_LEFT_PANEL_WIDTH, 224, 200, 380),
  minWidth: 200,
  maxWidth: 380,
  onWidthChange: (width) => {
    localStorage.setItem(STORAGE_KEY_LEFT_PANEL_WIDTH, String(width))
  },
})

const assistantPanel = useResizePanel({
  initialWidth: getStoredPanelWidth(STORAGE_KEY_ASSISTANT_WIDTH, 360, 300, 680),
  minWidth: 450,
  maxWidth: 680,
  resizeFrom: 'left',
  onWidthChange: (width) => {
    localStorage.setItem(STORAGE_KEY_ASSISTANT_WIDTH, String(width))
  },
})

const {
  width: leftPanelWidth,
  panelRef: leftPanelRef,
  isResizing: isLeftPanelResizing,
  handleMouseDown: handleLeftPanelResizeStart,
} = leftPanel

const {
  width: assistantPanelWidth,
  panelRef: assistantPanelRef,
  isResizing: isAssistantPanelResizing,
  handleMouseDown: handleAssistantPanelResizeStart,
} = assistantPanel

const codingScope = computed(() => ({
  space: 'coding' as const,
  projectKey: currentProjectKey.value,
}))

const canUseAssistant = computed(() => !!currentProjectKey.value)

provideMarkConversationDirty((conversationId: string) => {
  dirtyConversations.add(conversationId)
})

const { data: conversationsData, isPending: isLoadingConversations } = useConversationListQuery(() => codingScope.value)
const { data: conversationData } = useConversationQuery(() => chatStore.currentConversationId)

watch(codingScope, (scope) => {
  chatStore.setConversationScope(scope)
}, { immediate: true })

watch(conversationsData, (data) => {
  if (data) {
    chatStore.conversations = data
  }
})

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

onMounted(async () => {
  await chatStore.loadModelSettings()

  const savedPath = lastWorkspacePath.value.trim()
  if (!savedPath) {
    return
  }

  try {
    await runWithLoadingState(isWorkspaceLoading, async () => {
      const result = await workspaceApi.openWorkspace(savedPath)
      const projectKey = await createProjectKey(result.rootPath)
      currentProjectName.value = result.rootName
      currentProjectPath.value = result.rootPath
      currentProjectKey.value = projectKey
      currentBrowsePath.value = result.rootPath
    })
  }
  catch {
    lastWorkspacePath.value = ''
  }
})

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runWithLoadingState(
  target: { value: boolean },
  task: () => Promise<void>,
  options: { delay?: number, minVisible?: number } = {},
) {
  const delay = options.delay ?? 140
  const minVisible = options.minVisible ?? 160

  let shownAt = 0
  const timer = setTimeout(() => {
    target.value = true
    shownAt = Date.now()
  }, delay)

  try {
    await task()
  }
  finally {
    clearTimeout(timer)
    if (shownAt > 0) {
      const visibleFor = Date.now() - shownAt
      if (visibleFor < minVisible) {
        await sleep(minVisible - visibleFor)
      }
      target.value = false
    }
  }
}

function filterDirectoryEntries(entries: WorkspaceDirectoryEntry[], keyword: string): WorkspaceDirectoryEntry[] {
  const query = keyword.trim().toLowerCase()
  if (!query) {
    return entries
  }
  return entries.filter(entry => entry.name.toLowerCase().includes(query))
}

function splitInputPath(inputPath: string): { browsePath: string, keyword: string } {
  const trimmed = inputPath.trim()
  if (!trimmed) {
    return { browsePath: '', keyword: '' }
  }

  const normalized = trimmed.endsWith('/')
    ? trimmed.slice(0, -1)
    : trimmed

  if (trimmed.endsWith('/')) {
    return { browsePath: normalized || '/', keyword: '' }
  }

  const slashIndex = normalized.lastIndexOf('/')
  if (slashIndex <= 0) {
    return { browsePath: normalized, keyword: '' }
  }

  return {
    browsePath: normalized.slice(0, slashIndex),
    keyword: normalized.slice(slashIndex + 1),
  }
}

async function loadBrowseEntries(path: string, options: { silent?: boolean, keyword?: string } = {}) {
  if (!path) {
    return
  }

  const token = ++browseRequestToken

  try {
    await runWithLoadingState(isWorkspacePathLoading, async () => {
      const result = await workspaceApi.fetchWorkspaceDirectories(path)

      if (token !== browseRequestToken) {
        return
      }

      currentBrowsePath.value = result.path
      allBrowseEntries.value = result.entries
      browseEntries.value = filterDirectoryEntries(result.entries, options.keyword || '')
      isBrowseTruncated.value = result.truncated
    })
  }
  catch (error) {
    if (!options.silent) {
      toast.error(error instanceof Error ? error.message : '加载目录失败')
    }
  }
}

function handlePathInput(path: string) {
  const { browsePath, keyword } = splitInputPath(path)
  if (!browsePath) {
    return
  }

  if (currentBrowsePath.value === browsePath && allBrowseEntries.value.length > 0) {
    browseEntries.value = filterDirectoryEntries(allBrowseEntries.value, keyword)
    return
  }

  loadBrowseEntries(browsePath, { silent: true, keyword })
}

async function openWorkspacePicker() {
  isWorkspacePickerOpen.value = true

  try {
    await runWithLoadingState(isWorkspacePickerLoading, async () => {
      const result = await workspaceApi.fetchWorkspaceRoots()
      const nextPath = currentBrowsePath.value || result.defaultPath || result.roots[0]?.path || ''
      if (nextPath) {
        await loadBrowseEntries(nextPath)
      }
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '加载工作空间根目录失败')
  }
}

function closeWorkspacePicker() {
  isWorkspacePickerOpen.value = false
}

async function openCurrentBrowsePathAsWorkspace() {
  if (!currentBrowsePath.value) {
    return
  }

  try {
    await runWithLoadingState(isWorkspaceLoading, async () => {
      const result = await workspaceApi.openWorkspace(currentBrowsePath.value)
      const projectKey = await createProjectKey(result.rootPath)
      currentProjectName.value = result.rootName
      currentProjectPath.value = result.rootPath
      currentProjectKey.value = projectKey
      lastWorkspacePath.value = result.rootPath
      activeSection.value = 'workspace'
      isWorkspacePickerOpen.value = false
      isHistoryOpen.value = false
    })
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : '打开工作空间失败')
  }
}

function goToParentBrowsePath() {
  if (!currentBrowsePath.value) {
    return
  }

  const normalized = currentBrowsePath.value.endsWith('/')
    ? currentBrowsePath.value.slice(0, -1)
    : currentBrowsePath.value
  const index = normalized.lastIndexOf('/')

  if (index <= 0) {
    return
  }

  const parentPath = normalized.slice(0, index)
  if (parentPath) {
    loadBrowseEntries(parentPath)
  }
}

async function handleSend(content: string) {
  if (!content.trim() || !canUseAssistant.value)
    return

  const targetConversationId = await chatStore.sendMessage(content)
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
  isHistoryOpen.value = false
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

function toggleHistory() {
  if (!canUseAssistant.value)
    return
  isHistoryOpen.value = !isHistoryOpen.value
}

function handleNewConversation() {
  if (!canUseAssistant.value)
    return
  chatStore.newConversation()
  isHistoryOpen.value = false
}

async function handleCommit() {
  const stagedCount = gitStatus.files.value.filter(f => f.staged).length
  const message = await toast.prompt({
    title: '提交变更',
    message: `将提交 ${stagedCount} 个暂存文件`,
    placeholder: 'feat: ...',
    confirmText: '提交',
    cancelText: '取消',
    multiline: true,
  })
  if (!message)
    return

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
      <aside
        ref="leftPanelRef"
        class="min-w-0 border-r border-border bg-sidebar-background flex flex-col relative"
        :class="[
          isLeftPanelResizing ? '' : 'transition-[width] duration-150',
          isLeftSidebarCollapsed ? 'items-center' : '',
        ]"
        :style="{ width: isLeftSidebarCollapsed ? '48px' : `${leftPanelWidth}px` }"
      >
        <!-- Section buttons -->
        <div :class="isLeftSidebarCollapsed ? 'p-1.5 space-y-0.5' : 'p-2 space-y-0.5'">
          <button
            class="flex items-center rounded transition-colors"
            :class="[
              isLeftSidebarCollapsed
                ? 'h-8 w-8 inline-flex items-center justify-center'
                : 'w-full text-left px-2.5 py-2 text-sm',
              activeSection === 'workspace' && !chatStore.viewingPlan
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            ]"
            :title="isLeftSidebarCollapsed ? '编码工作台' : undefined"
            @click="activeSection = 'workspace'; chatStore.closePlan()"
          >
            <div v-if="isLeftSidebarCollapsed" class="i-charm:git-request-cross h-4 w-4" />
            <div v-else class="inline-flex items-center gap-2 whitespace-nowrap">
              <span class="i-charm:git-request-cross h-4 w-4" />
              变更审阅
            </div>
          </button>

          <button
            class="flex items-center rounded transition-colors"
            :class="[
              isLeftSidebarCollapsed
                ? 'h-8 w-8 inline-flex items-center justify-center'
                : 'w-full text-left px-2.5 py-2 text-sm',
              activeSection === 'planning' && !chatStore.viewingPlan
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
            ]"
            :title="isLeftSidebarCollapsed ? '任务编排' : undefined"
            @click="activeSection = 'planning'; chatStore.closePlan()"
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

        <!-- Resize handle (absolute, only when expanded) -->
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

      <div class="flex-1 min-w-0 flex">
        <div class="flex-1 min-w-0 flex flex-col border-r border-border">
          <!-- Plan viewer (replaces normal content when a plan is open) -->
          <PlanViewer
            v-if="chatStore.viewingPlan"
            :filename="chatStore.viewingPlan.filename"
            :content="chatStore.viewingPlan.content"
            @close="chatStore.closePlan()"
          />

          <!-- Normal content -->
          <template v-else>
            <header class="h-11 border-b border-border px-4 flex items-center justify-between">
              <button
                class="min-w-0 inline-flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-muted"
                @click="openWorkspacePicker"
              >
                <span class="i-material-symbols:folder-managed h-4 w-4 flex-none text-muted-foreground" />
                <span class="text-sm text-foreground/90">工作目录</span>
                <span
                  class="max-w-[28rem] truncate text-xs font-mono text-muted-foreground"
                  :title="currentProjectPath || currentProjectName"
                >
                  {{ currentProjectPath || currentProjectName }}
                </span>
              </button>

              <button
                v-if="activeSection === 'planning'"
                class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-1 transition-colors"
                @click="kanbanBoardRef?.openCreate()"
              >
                <div class="i-carbon-add h-4 w-4" />
                <span>新建任务</span>
              </button>
            </header>

            <main class="flex-1 min-h-0">
              <section v-if="activeSection === 'planning'" class="h-full min-h-0">
                <KanbanBoard
                  v-if="currentProjectKey"
                  ref="kanbanBoardRef"
                  :project-key="currentProjectKey"
                  @switch-conversation="handleSelectConversation"
                />
                <div v-else class="h-full flex items-center justify-center">
                  <span class="text-xs text-muted-foreground">请先选择工作空间</span>
                </div>
              </section>

              <section v-else class="h-full min-h-0">
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
                    <span class="text-xs text-muted-foreground/80 block mt-1">点击左侧「工作目录」打开项目</span>
                  </div>
                </div>
              </section>
            </main>
          </template>
        </div>

        <aside
          ref="assistantPanelRef"
          class="min-w-0 flex flex-col relative"
          :class="isAssistantPanelResizing ? '' : 'transition-[width] duration-150'"
          :style="{ width: `${assistantPanelWidth}px` }"
        >
          <!-- Resize handle (absolute, left edge) -->
          <div
            class="absolute top-0 -left-1.5 w-3 h-full cursor-col-resize z-10 group/resize"
            style="touch-action: none; user-select: none;"
            @mousedown="handleAssistantPanelResizeStart"
          >
            <div
              class="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-colors"
              :class="isAssistantPanelResizing ? 'bg-primary/50' : 'bg-transparent group-hover/resize:bg-primary/30'"
            />
          </div>
          <div class="min-h-13 px-3 py-1.5 border-b border-border flex items-center justify-between">
            <div class="min-w-0">
              <p v-if="isHistoryOpen" class="text-sm font-medium">
                项目历史会话
              </p>
              <template v-else>
                <p class="text-sm font-medium leading-tight">
                  研发助手
                </p>
              </template>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                :class="{
                  'opacity-40 cursor-not-allowed': !canUseAssistant,
                }"
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
            </div>
          </div>

          <div v-if="isHistoryOpen" class="flex-1 min-h-0 bg-sidebar-background/60">
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

          <template v-else>
            <div class="flex-1 min-h-0">
              <MessageList
                :messages="chatStore.visibleMessages"
                :is-loading="chatStore.isLoading"
                :is-streaming="chatStore.isStreaming"
                scroll-button-right="calc((100% - min(100%, 48rem)) / 2 + 2rem)"
              />
            </div>

            <div class="px-0 pb-3">
              <ChatInput
                class="px-2"
                :disabled="!canUseAssistant"
                :is-streaming="chatStore.isStreaming"
                :show-bottom-hint="false"
                show-coding-mode
                disabled-placeholder="请选择工作空间后开始项目内对话。"
                @send="handleSend"
                @stop="handleStop"
              />
            </div>
          </template>
        </aside>
      </div>
    </div>
  </div>

  <DirectoryBrowserModal
    :open="isWorkspacePickerOpen"
    :current-path="currentBrowsePath"
    :entries="browseEntries"
    :loading="isWorkspacePickerLoading || isWorkspacePathLoading"
    :truncated="isBrowseTruncated"
    :confirm-loading="isWorkspaceLoading"
    @close="closeWorkspacePicker"
    @refresh="loadBrowseEntries(currentBrowsePath)"
    @go-parent="goToParentBrowsePath"
    @navigate="loadBrowseEntries"
    @submit-path="handlePathInput"
    @confirm="openCurrentBrowsePathAsWorkspace"
  />
</template>
