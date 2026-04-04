<script setup lang="ts">
import ChatInput from '@/components/chat/ChatInput.vue'
import ConversationList from '@/components/chat/ConversationList.vue'
import ConversationListItem from '@/components/chat/ConversationListItem.vue'
import MessageList from '@/components/chat/MessageList.vue'
import CommitDialog from '@/components/code/CommitDialog.vue'
import PlanViewer from '@/components/code/PlanViewer.vue'
import SessionChangesPanel from '@/components/code/SessionChangesPanel.vue'
import KanbanBoard from '@/components/kanban/KanbanBoard.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { useCodingView } from '@/composables/useCodingView'

defineOptions({ name: 'CodingView' })

const {
  activeSection,
  currentProjectKey,
  kanbanBoardRef,
  isHistoryOpen,
  isCommitDialogOpen,
  isLeftSidebarCollapsed,
  chatStore,
  planStore,
  workspaceStore,
  gitStatus,
  leftPanelWidth,
  leftPanelRef,
  isLeftPanelResizing,
  handleLeftPanelResizeStart,
  canUseAssistant,
  isGitStatusUpdating,
  isLoadingConversations,
  handleSend,
  handleStop,
  handleSelectConversation,
  toggleHistory,
  handleDeleteConversation,
  handleNewConversation,
  handleCommit,
  handleCommitConfirm,
  handlePush,
  handleDiscard,
  currentProjectConversations,
  recentConversations,
} = useCodingView()
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
