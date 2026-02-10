<script setup lang="ts">
import type { DropdownItem } from '@locus-agent/ui'
import { Dropdown, useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { useDark, useToggle } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationListQuery } from '@/composables/queries'
import { useChatStore } from '@/stores/chat'
import ConversationItem from './ConversationItem.vue'

declare const __APP_VERSION__: string
const appVersion = __APP_VERSION__

const chatStore = useChatStore()
const toast = useToast()
const router = useRouter()
const route = useRoute()
const queryCache = useQueryCache()

// Pinia Colada 查询：缓存会话列表
const { data: conversationsData, isPending: isLoadingConversations } = useConversationListQuery()

// 同步查询数据到 store
watch(conversationsData, (data) => {
  if (data) {
    chatStore.conversations = data
  }
})

/** Navigate back to chat page if currently on a different route */
function ensureChatRoute() {
  if (route.name !== 'chat') {
    router.push({ name: 'chat' })
  }
}
const isDark = useDark()
const toggleDark = useToggle(isDark)

const menuItems = computed<DropdownItem[]>(() => [
  {
    key: 'theme',
    label: isDark.value ? '浅色模式' : '深色模式',
    icon: isDark.value ? 'i-carbon-sun' : 'i-carbon-moon',
  },
  {
    key: 'settings',
    label: '设置',
    icon: 'i-carbon-settings',
    separator: true,
  },
])

function handleMenuSelect(key: string) {
  switch (key) {
    case 'theme':
      toggleDark()
      break
    case 'settings':
      router.push({ name: 'settings' })
      break
  }
}

const isResizing = ref(false)
const startX = ref(0)
const startWidth = ref(0)
const sidebarRef = ref<HTMLElement | null>(null)
let rafId: number | null = null

function handleMouseDown(e: MouseEvent) {
  if (chatStore.isSidebarCollapsed)
    return

  isResizing.value = true
  startX.value = e.clientX
  startWidth.value = chatStore.sidebarWidth
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.body.style.pointerEvents = 'none'
  e.preventDefault()
  e.stopPropagation()
}

function handleMouseMove(e: MouseEvent) {
  if (!isResizing.value)
    return

  if (rafId !== null)
    cancelAnimationFrame(rafId)

  rafId = requestAnimationFrame(() => {
    const deltaX = e.clientX - startX.value
    const newWidth = startWidth.value + deltaX
    const minWidth = 180
    const maxWidth = 400
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    if (sidebarRef.value) {
      sidebarRef.value.style.width = `${clampedWidth}px`
    }
    chatStore.setSidebarWidth(clampedWidth)
    rafId = null
  })
}

function handleMouseUp() {
  if (isResizing.value) {
    isResizing.value = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.body.style.pointerEvents = ''
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
}

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove, { passive: false })
  document.addEventListener('mouseup', handleMouseUp)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  handleMouseUp()
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
  }
})

function handleNewChat() {
  chatStore.newConversation()
  ensureChatRoute()
}

function handleSelectConversation(id: string) {
  chatStore.switchConversation(id)
  ensureChatRoute()
}

async function handleDeleteConversation(id: string) {
  const confirmed = await toast.confirm({
    title: '删除对话',
    message: '确定要删除这个对话吗？删除后无法恢复。',
    confirmText: '删除',
    cancelText: '取消',
    type: 'error',
  })
  if (confirmed) {
    await chatStore.removeConversation(id)
    toast.success('对话已删除')
    queryCache.invalidateQueries({ key: ['conversations'] })
  }
}
</script>

<template>
  <div class="flex h-full relative">
    <aside
      ref="sidebarRef"
      class="flex flex-col h-full bg-sidebar-background border-r border-sidebar-border"
      :class="[
        chatStore.isSidebarCollapsed ? 'w-0 overflow-hidden' : '',
        isResizing ? '' : 'transition-all duration-200',
      ]"
      :style="chatStore.isSidebarCollapsed ? {} : { width: `${chatStore.sidebarWidth}px`, willChange: isResizing ? 'width' : 'auto' }"
    >
      <!-- Header -->
      <div class="flex-shrink-0 p-3 border-b border-sidebar-border">
        <button
          class="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-sidebar-border bg-sidebar-background text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-150 whitespace-nowrap flex-shrink-0"
          @click="handleNewChat"
        >
          <div class="i-carbon-add h-4 w-4" />
          <span class="text-sm font-medium">新对话</span>
        </button>
      </div>

      <!-- Conversation List -->
      <div class="flex-1 overflow-y-auto p-2">
        <!-- Loading state -->
        <div
          v-if="isLoadingConversations"
          class="flex-col-center py-8 text-muted-foreground"
        >
          <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
          <span class="text-xs mt-2 opacity-70">加载中...</span>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="chatStore.conversations.length === 0"
          class="flex-col-center py-8 text-muted-foreground"
        >
          <div class="i-carbon-chat h-8 w-8 opacity-30" />
          <span class="text-xs mt-2 opacity-70">暂无对话</span>
        </div>

        <!-- Conversation items -->
        <div v-else class="space-y-1">
          <ConversationItem
            v-for="conversation in chatStore.conversations"
            :key="conversation.id"
            :conversation="conversation"
            :is-active="conversation.id === chatStore.currentConversationId"
            @select="handleSelectConversation"
            @delete="handleDeleteConversation"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="flex-shrink-0 p-3 border-t border-sidebar-border">
        <div class="flex items-center justify-between text-xs text-muted-foreground opacity-70">
          <span>Locus Agent <span class="opacity-50">v{{ appVersion }}</span></span>
          <Dropdown :items="menuItems" placement="top-end" @select="handleMenuSelect">
            <template #trigger>
              <button
                class="p-1 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors duration-150"
                title="菜单"
              >
                <div class="i-ic:baseline-menu h-3.5 w-3.5" />
              </button>
            </template>
          </Dropdown>
        </div>
      </div>
    </aside>

    <!-- Resizer -->
    <div
      v-if="!chatStore.isSidebarCollapsed"
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-border/50 transition-colors duration-150 z-10"
      :class="{ 'bg-primary/50': isResizing }"
      style="touch-action: none; user-select: none;"
      @mousedown="handleMouseDown"
    />
  </div>
</template>
