<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ChatInput from '@/components/ChatInput.vue'
import MessageList from '@/components/MessageList.vue'
import Sidebar from '@/components/Sidebar.vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
// 标记是否正在同步，避免 watch 循环
const isSyncingFromUrl = ref(false)
const isSyncingToUrl = ref(false)

// 从 URL query 恢复会话
onMounted(async () => {
  const conversationId = route.query.session as string | undefined
  if (conversationId && conversationId !== chatStore.currentConversationId) {
    isSyncingFromUrl.value = true
    const success = await chatStore.switchConversation(conversationId)
    isSyncingFromUrl.value = false

    // If conversation not found, clear query to restore empty state
    if (!success) {
      isSyncingToUrl.value = true
      router.replace({ query: {} })
      isSyncingToUrl.value = false
    }
  }
  else if (!conversationId && chatStore.currentConversationId) {
    // 如果 URL 没有会话 ID 但 store 有，同步到 URL
    isSyncingToUrl.value = true
    router.replace({ query: { session: chatStore.currentConversationId } })
    isSyncingToUrl.value = false
  }

  // 加载会话列表
  await chatStore.loadConversations()
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
  async (newSessionId) => {
    if (isSyncingToUrl.value)
      return

    const sessionId = typeof newSessionId === 'string' ? newSessionId : undefined
    if (sessionId && sessionId !== chatStore.currentConversationId) {
      isSyncingFromUrl.value = true
      const success = await chatStore.switchConversation(sessionId)
      isSyncingFromUrl.value = false

      // If conversation not found, clear query to restore empty state
      if (!success) {
        isSyncingToUrl.value = true
        router.replace({ query: {} })
        isSyncingToUrl.value = false
      }
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

  await chatStore.sendMessage(content)
}

function handleStop() {
  chatStore.stopGeneration()
}

function handleNewChat() {
  chatStore.newConversation()
}
</script>

<template>
  <div class="h-screen flex bg-background">
    <!-- Sidebar -->
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

          <!-- Title -->
          <h1 class="text-sm font-medium text-foreground truncate max-w-[200px] sm:max-w-none">
            {{ chatStore.currentConversation?.title || '新对话' }}
          </h1>
        </div>

        <div class="flex items-center gap-1">
          <!-- New chat button (mobile) -->
          <button
            class="btn-ghost btn-icon sm:hidden"
            title="新对话"
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
          :disabled="chatStore.isLoading && !chatStore.isStreaming"
          :is-streaming="chatStore.isStreaming"
          @send="handleSend"
          @stop="handleStop"
        />
      </footer>
    </div>
  </div>
</template>
