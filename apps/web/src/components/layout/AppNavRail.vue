<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkspacePopover from '@/components/layout/WorkspacePopover.vue'
import { useGlobalSearch } from '@/composables/useGlobalSearch'

const router = useRouter()
const route = useRoute()
const isDark = useDark()
const toggleDark = useToggle(isDark)
const { openSearch } = useGlobalSearch()

const currentModule = computed(() => {
  if (route.name === 'chat' || route.name === 'memories' || route.name === 'coding' || route.name === 'skills')
    return route.name
  return ''
})

function navigateTo(name: string) {
  if (route.name !== name) {
    router.push({ name })
  }
}

interface NavItem {
  key: string
  icon: string
  title: string
}

const navItems: NavItem[] = [
  {
    key: 'chat',
    icon: 'i-streamline-pixel:email-mail-chat',
    title: '对话',
  },
  {
    key: 'coding',
    icon: 'i-streamline-pixel:coding-apps-websites-plugin',
    title: '编程',
  },
  {
    key: 'skills',
    icon: 'i-streamline-pixel:music-walkman-cassette',
    title: '技能',
  },
  {
    key: 'memories',
    icon: 'i-streamline-pixel:content-files-archive-books-1',
    title: '记忆',
  },
]
</script>

<template>
  <nav class="flex flex-col items-center w-12 h-full bg-sidebar-background border-r border-sidebar-border flex-shrink-0">
    <!-- Search button -->
    <div class="flex flex-col items-center pt-2 pb-1">
      <button
        class="flex-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors duration-150"
        title="搜索"
        @click="openSearch"
      >
        <div class="i-ic:round-search" />
      </button>
    </div>

    <!-- Top nav items -->
    <div class="flex flex-col items-center gap-1">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="relative flex-center w-9 h-9 rounded-lg transition-colors duration-150"
        :class="currentModule === item.key
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'"
        :title="item.title"
        @click="navigateTo(item.key)"
      >
        <div
          :class="item.icon"
          class="h-5 w-5"
        />
        <!-- Active indicator -->
        <div
          v-if="currentModule === item.key"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-foreground"
        />
      </button>
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Bottom actions -->
    <div class="flex flex-col items-center gap-1 pb-3">
      <!-- Workspace -->
      <WorkspacePopover />

      <!-- Theme toggle -->
      <button
        class="flex-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors duration-150"
        :title="isDark ? '浅色模式' : '深色模式'"
        @click="toggleDark()"
      >
        <div :class="isDark ? 'i-carbon-sun' : 'i-carbon-moon'" class="h-4.5 w-4.5" />
      </button>

      <!-- Settings -->
      <button
        class="flex-center w-9 h-9 rounded-lg transition-colors duration-150"
        :class="route.name === 'settings'
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'"
        title="设置"
        @click="navigateTo('settings')"
      >
        <div class="i-carbon-settings h-4.5 w-4.5" />
      </button>
    </div>
  </nav>
</template>
