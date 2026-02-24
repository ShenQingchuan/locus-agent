<script setup lang="ts">
import type { DropdownItem } from '@locus-agent/ui'
import { Dropdown, useToast } from '@locus-agent/ui'
import { useQueryCache } from '@pinia/colada'
import { useDark, useToggle } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConversationListQuery } from '@/composables/queries'
import { useChatStore } from '@/stores/chat'
import ConversationList from './ConversationList.vue'

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
    key: 'clear-all',
    label: '清空所有对话',
    icon: 'i-carbon-trash-can',
    separator: true,
  },
  {
    key: 'settings',
    label: '设置',
    icon: 'i-carbon-settings',
    separator: true,
  },
])

async function handleClearAll() {
  const ids = chatStore.conversations.map(c => c.id)
  if (ids.length === 0)
    return

  const confirmed = await toast.confirm({
    title: '清空所有对话',
    message: `确定要删除全部 ${ids.length} 个对话吗？删除后无法恢复。`,
    confirmText: '全部删除',
    cancelText: '取消',
    type: 'error',
  })
  if (!confirmed)
    return

  await Promise.all(ids.map(id => chatStore.removeConversation(id)))
  chatStore.newConversation()
  queryCache.invalidateQueries({ key: ['conversations'] })
  toast.success('已清空所有对话')
}

function handleMenuSelect(key: string) {
  switch (key) {
    case 'theme':
      toggleDark()
      break
    case 'clear-all':
      handleClearAll()
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
      <ConversationList
        :conversations="chatStore.conversations"
        :current-id="chatStore.currentConversationId ?? undefined"
        :loading="isLoadingConversations"
        class="flex-1 overflow-y-auto"
        @select="handleSelectConversation"
        @delete="handleDeleteConversation"
      />

      <!-- Footer -->
      <div class="flex-shrink-0 p-3 border-t border-sidebar-border">
        <div class="flex items-center text-xs text-muted-foreground/70">
          <span class="font-bold font-mono">Locus Agent</span>
          <span class="ml-1 font-mono text-muted-foreground/60">v{{ appVersion }}</span>
          <Dropdown class="ml-auto" :items="menuItems" placement="top-end" trigger="hover" @select="handleMenuSelect">
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
