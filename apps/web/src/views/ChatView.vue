<script setup lang="ts">
import { useQueryCache } from '@pinia/colada'
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatInput from '@/components/chat/ChatInput.vue'
import MessageList from '@/components/chat/MessageList.vue'
import Sidebar from '@/components/chat/Sidebar.vue'
import AppNavRail from '@/components/layout/AppNavRail.vue'
import { getConversationListQueryKey, useConversationQuery } from '@/composables/queries'
import { provideMarkConversationDirty } from '@/composables/useDirtyConversation'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
const queryCache = useQueryCache()
const chatScope = { space: 'chat' as const }

// Title editing state
const isEditingTitle = ref(false)
const editedTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

// 标记是否正在同步，避免 watch 循环
const isSyncingFromUrl = ref(false)
const isSyncingToUrl = ref(false)

// 跟踪已修改的会话（发送过消息），切换时失效缓存
const dirtyConversations = new Set<string>()

// Provide 标记 dirty 的方法给子组件使用（如重试、编辑消息时）
provideMarkConversationDirty((conversationId: string) => {
  dirtyConversations.add(conversationId)
})

// Pinia Colada 查询：缓存会话消息数据
const { data: conversationData } = useConversationQuery(
  () => chatStore.currentConversationId,
)

// 监听查询数据变化，应用到 store
// 注意：streaming/loading 期间跳过，避免 useConversationQuery 的异步结果覆盖乐观更新
// 场景：新会话时 currentConversationId 从 null→uuid 触发 query，
// 但此时 GET /api/conversations/:id 可能返回 404（会话尚未被 POST 创建），
// 导致 data===null 分支调用 newConversation() 清空前端消息。
watch(conversationData, (data) => {
  const activeConversationId = chatStore.currentConversationId
  if (!activeConversationId)
    return

  // Guard against stale async query results from other conversations.
  if (data && data.conversation.id !== activeConversationId)
    return

  // streaming 或 loading 期间，前端消息由 sendMessage 乐观管理，不被服务端数据覆盖
  if (chatStore.isLoading || chatStore.isStreaming)
    return

  if (data) {
    chatStore.applyConversationData(data, activeConversationId)
  }
  else if (data === null) {
    // 会话未找到，重置状态
    chatStore.newConversation()
    isSyncingToUrl.value = true
    router.replace({ query: {} })
    isSyncingToUrl.value = false
  }
})

// 切换离开已修改的会话时，失效其缓存（下次访问重新获取最新数据）
watch(() => chatStore.currentConversationId, (_newId, oldId) => {
  if (oldId && dirtyConversations.has(oldId)) {
    queryCache.invalidateQueries({ key: ['conversation', oldId] })
    dirtyConversations.delete(oldId)
  }
})

// 从 URL query 恢复会话
onMounted(async () => {
  const conversationId = route.query.session as string | undefined
  if (conversationId && conversationId !== chatStore.currentConversationId) {
    isSyncingFromUrl.value = true
    chatStore.switchConversation(conversationId)
    isSyncingFromUrl.value = false
  }
  else if (!conversationId && chatStore.currentConversationId) {
    // 如果 URL 没有会话 ID 但 store 有，同步到 URL
    isSyncingToUrl.value = true
    router.replace({ query: { session: chatStore.currentConversationId } })
    isSyncingToUrl.value = false
  }

  // 加载模型设置
  chatStore.setConversationScope(chatScope)
  await chatStore.loadModelSettings()
})

// 监听 store 中的会话 ID 变化，同步到 URL
watch(
  () => chatStore.currentConversationId,
  (newId) => {
    if (isSyncingFromUrl.value)
      return

    const urlId = route.query.session as string | undefined
    if (newId !== urlId) {
      isSyncingToUrl.value = true
      if (newId) {
        router.replace({ query: { session: newId } })
      }
      else {
        router.replace({ query: {} })
      }
      isSyncingToUrl.value = false
    }
  },
)

// 监听 URL query 变化，恢复会话
watch(
  () => route.query.session,
  (newSessionId) => {
    if (isSyncingToUrl.value)
      return

    const sessionId = typeof newSessionId === 'string' ? newSessionId : undefined
    if (sessionId && sessionId !== chatStore.currentConversationId) {
      isSyncingFromUrl.value = true
      chatStore.switchConversation(sessionId)
      isSyncingFromUrl.value = false
    }
    else if (!sessionId && chatStore.currentConversationId) {
      isSyncingFromUrl.value = true
      chatStore.newConversation()
      isSyncingFromUrl.value = false
    }
  },
)

async function handleSend(content: string) {
  if (!content.trim())
    return

  const targetConversationId = await chatStore.sendMessage(content)
  // 标记会话为已修改，刷新会话列表
  if (targetConversationId) {
    dirtyConversations.add(targetConversationId)
  }
  queryCache.invalidateQueries({ key: getConversationListQueryKey(chatScope) })
}

function handleStop() {
  chatStore.stopGeneration()
}

function handleNewChat() {
  chatStore.newConversation()
}

const isGeneratingTitle = ref(false)

// Start editing title mode
function startEditingTitle() {
  if (!chatStore.currentConversationId)
    return
  editedTitle.value = chatStore.currentConversation?.title || ''
  isEditingTitle.value = true
  // Focus input after DOM update
  nextTick(() => {
    titleInputRef.value?.focus()
  })
}

// Cancel editing title
function cancelEditingTitle() {
  isEditingTitle.value = false
  editedTitle.value = ''
}

// Save title manually
async function saveTitle() {
  const conversationId = chatStore.currentConversationId
  if (!conversationId)
    return

  const newTitle = editedTitle.value.trim()
  if (newTitle && newTitle !== chatStore.currentConversation?.title) {
    await chatStore.updateTitle(conversationId, newTitle)
    queryCache.invalidateQueries({ key: getConversationListQueryKey(chatScope) })
  }
  isEditingTitle.value = false
  editedTitle.value = ''
}

// Handle keydown in title input
function handleTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    saveTitle()
  }
  else if (e.key === 'Escape') {
    cancelEditingTitle()
  }
}

// Generate title using AI
async function handleGenerateTitle() {
  const conversationId = chatStore.currentConversationId
  if (!conversationId || isGeneratingTitle.value)
    return

  isGeneratingTitle.value = true
  try {
    await chatStore.generateTitle(conversationId)
    queryCache.invalidateQueries({ key: getConversationListQueryKey(chatScope) })
    // Exit edit mode after generation
    isEditingTitle.value = false
    editedTitle.value = ''
  }
  finally {
    isGeneratingTitle.value = false
  }
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <!-- App Navigation Rail -->
    <AppNavRail />

    <!-- Chat Sidebar (conversations) -->
    <Sidebar />

    <!-- Main chat area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Header -->
      <header class="flex-shrink-0 border-b border-border bg-background px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <!-- Sidebar toggle -->
          <button
            class="btn-ghost btn-icon"
            title="切换侧边栏"
            @click="chatStore.toggleSidebar()"
          >
            <div
              v-if="chatStore.isSidebarCollapsed"
              class="i-carbon-side-panel-open h-4 w-4"
            />
            <div
              v-else
              class="i-carbon-side-panel-close h-4 w-4"
            />
          </button>

          <!-- Title: Editable input or static display -->
          <div v-if="isEditingTitle && chatStore.currentConversationId" class="flex items-center gap-1">
            <input
              ref="titleInputRef"
              v-model="editedTitle"
              type="text"
              class="text-sm font-medium text-foreground bg-muted rounded px-2 py-1 w-[200px] sm:w-[280px] border-none outline-none focus:ring-2 focus:ring-ring"
              :placeholder="isGeneratingTitle ? '正在智能生成标题 ...' : '输入会话标题'
              "
              :disabled="isGeneratingTitle"
              @keydown="handleTitleKeydown"
              @blur="saveTitle"
            >
            <!-- Magic wand button for AI generation -->
            <button
              class="btn-ghost btn-icon flex-shrink-0"
              :class="{ 'opacity-50 pointer-events-none': isGeneratingTitle }"
              title="智能生成标题"
              @click="handleGenerateTitle"
            >
              <div v-if="isGeneratingTitle" class="i-svg-spinners:ring-resize h-4 w-4" />
              <div v-else class="i-streamline-plump:magic-wand-1-remix h-4 w-4" />
            </button>
          </div>
          <h1
            v-else
            class="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-none cursor-pointer hover:text-muted-foreground transition-colors"
            :class="{ 'text-muted-foreground': !chatStore.currentConversation?.title }"
            @click="startEditingTitle"
          >
            {{ chatStore.currentConversation?.title || '新会话' }}
          </h1>
        </div>

        <div class="flex items-center gap-1">
          <!-- Generate title button (triggers edit mode) -->
          <button
            v-if="chatStore.currentConversationId && !isEditingTitle"
            class="btn-ghost btn-icon"
            title="智能生成标题"
            @click="startEditingTitle"
          >
            <div class="i-ix:rename text-lg" />
          </button>

          <!-- New chat button (mobile) -->
          <button
            class="btn-ghost btn-icon sm:hidden"
            title="新会话"
            @click="handleNewChat"
          >
            <div class="i-carbon-add h-4 w-4" />
          </button>
        </div>
      </header>

      <!-- Messages area -->
      <main class="flex-1 overflow-hidden">
        <MessageList
          :messages="chatStore.messages"
          :is-loading="chatStore.isLoading"
          :is-streaming="chatStore.isStreaming"
        />
      </main>

      <!-- Error display -->
      <div
        v-if="chatStore.hasError"
        class="flex-shrink-0 border-t border-destructive/20 bg-destructive/5 px-4 py-3"
      >
        <div class="max-w-3xl mx-auto flex items-center justify-between">
          <span class="text-sm text-destructive">
            {{ chatStore.error?.message }}
          </span>
          <button
            class="text-sm text-destructive/80 hover:text-destructive transition-colors duration-150"
            @click="chatStore.clearError()"
          >
            关闭
          </button>
        </div>
      </div>

      <!-- Input area -->
      <footer class="flex-shrink-0 border-t border-border bg-background px-4 py-4">
        <ChatInput
          :is-streaming="chatStore.isStreaming"
          @send="handleSend"
          @stop="handleStop"
        />
      </footer>
    </div>
  </div>
</template>
