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
import SessionChangesPanel from '@/components/code/SessionChangesPanel.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { getConversationListQueryKey, useConversationListQuery, useConversationQuery } from '@/composables/queries'
import { provideMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useGitStatus } from '@/composables/useGitStatus'
import { useResizePanel } from '@/composables/useResizePanel'
import { useChatStore } from '@/stores/chat'
import { createProjectKey } from '@/utils/projectKey'

type CodingSection = 'planning' | 'workspace'

const activeSection = ref<CodingSection>('planning')
const currentProjectName = ref('未选择工作空间')
const isWorkspaceLoading = ref(false)
const isWorkspacePickerOpen = ref(false)
const isWorkspacePickerLoading = ref(false)
const isWorkspacePathLoading = ref(false)
const currentBrowsePath = ref('')
const browseEntries = ref<WorkspaceDirectoryEntry[]>([])
const allBrowseEntries = ref<WorkspaceDirectoryEntry[]>([])
const isBrowseTruncated = ref(false)
let browseRequestToken = 0
const currentProjectKey = ref<string | undefined>()
const lastWorkspacePath = useLocalStorage('locus-agent:coding-last-workspace-path', '')
const isHistoryOpen = ref(false)
const dirtyConversations = new Set<string>()

const toast = useToast()
const chatStore = useChatStore()
const queryCache = useQueryCache()
const gitStatus = useGitStatus(currentBrowsePath)

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
      currentProjectKey.value = projectKey
      currentBrowsePath.value = result.rootPath
      activeSection.value = 'workspace'
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
      currentProjectKey.value = projectKey
      lastWorkspacePath.value = result.rootPath
      activeSection.value = 'workspace'
      isWorkspacePickerOpen.value = false
      isHistoryOpen.value = false

      if (result.truncated) {
        toast.warning('工作空间较大，已进行部分裁剪显示')
      }
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

async function handleCommit() {
  const message = window.prompt('请输入提交信息：')
  if (!message?.trim())
    return

  try {
    const result = await gitStatus.commit(message.trim())
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
  }
})

const currentProjectConversations = computed<Conversation[]>(() => chatStore.conversations)
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 min-w-0 flex">
      <aside
        ref="leftPanelRef"
        class="min-w-0 border-r border-border bg-sidebar-background flex flex-col"
        :class="isLeftPanelResizing ? '' : 'transition-[width] duration-150'"
        :style="{ width: `${leftPanelWidth}px` }"
      >
        <div class="px-3 py-3 border-b border-border min-h-12">
          <button
            class="w-full text-left text-xs text-muted-foreground truncate hover:text-foreground transition-colors"
            @click="openWorkspacePicker"
          >
            当前项目：<span class="font-mono text-foreground">{{ currentProjectName }}</span>
          </button>
        </div>

        <div class="p-2 space-y-0.5">
          <button
            class="w-full text-left px-2.5 py-2 rounded text-sm transition-colors"
            :class="activeSection === 'workspace'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'"
            @click="activeSection = 'workspace'"
          >
            <span class="inline-flex items-center gap-2">
              <span class="i-streamline:computer-pc-desktop-remix h-4 w-4" />
              编码工作台
            </span>
          </button>

          <button
            class="w-full text-left px-2.5 py-2 rounded text-sm transition-colors"
            :class="activeSection === 'planning'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'"
            @click="activeSection = 'planning'"
          >
            <span class="inline-flex items-center gap-2">
              <span class="i-bi:kanban-fill h-4 w-4" />
              任务编排
            </span>
          </button>
        </div>
      </aside>

      <div
        class="w-1 h-full cursor-col-resize hover:bg-border/60 transition-colors"
        :class="isLeftPanelResizing ? 'bg-primary/40' : ''"
        style="touch-action: none; user-select: none;"
        @mousedown="handleLeftPanelResizeStart"
      />

      <div class="flex-1 min-w-0 flex">
        <div class="flex-1 min-w-0 flex flex-col border-r border-border">
          <header class="h-11 border-b border-border px-4 flex items-center justify-between">
            <h1 class="text-sm font-semibold">
              {{ activeSection === 'planning' ? '任务编排' : '编码界面' }}
            </h1>
            <button
              v-if="activeSection === 'planning'"
              class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-1 transition-colors"
            >
              <div class="i-carbon-add h-4 w-4" />
              <span>新建任务</span>
            </button>
          </header>

          <main class="flex-1 min-h-0">
            <section
              v-if="activeSection === 'planning'"
              class="h-full min-h-0 grid grid-cols-1 md:grid-cols-3 md:divide-x divide-border"
            >
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban Backlog 占位示意</span>
              </div>
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban In Progress 占位示意</span>
              </div>
              <div class="min-h-0 overflow-y-auto px-3 py-2.5">
                <span class="text-xs text-muted-foreground">Kanban Done 占位示意</span>
              </div>
            </section>

            <section v-else class="h-full min-h-0">
              <SessionChangesPanel
                :files="gitStatus.files.value"
                :summary="gitStatus.summary.value"
                :is-loading="gitStatus.isLoading.value"
                :is-git-repo="gitStatus.isGitRepo.value"
                :selected-file-path="gitStatus.selectedFilePath.value"
                :selected-file-diff="gitStatus.selectedFileDiff.value"
                :is-diff-loading="gitStatus.isDiffLoading.value"
                @select="gitStatus.selectFile"
                @refresh="gitStatus.refresh"
                @commit="handleCommit"
                @discard="handleDiscard"
              />
            </section>
          </main>
        </div>

        <div
          class="w-1 h-full cursor-col-resize hover:bg-border/60 transition-colors"
          :class="isAssistantPanelResizing ? 'bg-primary/40' : ''"
          style="touch-action: none; user-select: none;"
          @mousedown="handleAssistantPanelResizeStart"
        />

        <aside
          ref="assistantPanelRef"
          class="min-w-0 flex flex-col"
          :class="isAssistantPanelResizing ? '' : 'transition-[width] duration-150'"
          :style="{ width: `${assistantPanelWidth}px` }"
        >
          <div class="h-11 px-3 border-b border-border flex items-center justify-between">
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ isHistoryOpen ? '项目历史会话' : '研发助手' }}
              </p>
            </div>
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
                :messages="chatStore.messages"
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
