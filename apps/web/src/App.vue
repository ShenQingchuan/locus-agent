<script setup lang="ts">
import type { SearchCommandItemData } from '@/composables/useGlobalSearch'
import { CommandPalette, ToastContainer } from '@locus-agent/ui'
import { useMagicKeys, whenever } from '@vueuse/core'
import { computed } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useGlobalSearch } from '@/composables/useGlobalSearch'

const router = useRouter()

const {
  showCommandPalette,
  commandSearchResults,
  commandGroups,
  isCommandSearching,
  handleCommandSearch,
  handleCommandSelect,
} = useGlobalSearch()

// Cmd/Ctrl + , 呼出设置页面
const keys = useMagicKeys()
const openSettings = computed(() => !!(keys['Cmd+,']?.value || keys['Ctrl+,']?.value))

whenever(openSettings, () => {
  router.push({ name: 'settings' })
})
</script>

<template>
  <RouterView />
  <ToastContainer />

  <!-- Global CommandPalette search -->
  <CommandPalette
    v-model="showCommandPalette"
    :items="commandSearchResults"
    :groups="commandGroups"
    placeholder="搜索记忆、标签、对话..."
    manual-filter
    @search="handleCommandSearch"
    @select="handleCommandSelect"
  >
    <template #item="{ item }">
      <div v-if="item.icon" :class="item.icon" class="h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div class="flex-1 min-w-0">
        <div class="truncate">
          {{ item.label }}
        </div>
        <div v-if="(item.data as SearchCommandItemData)?.tags?.length" class="flex items-center gap-1 mt-0.5 overflow-hidden">
          <span
            v-for="tag in (item.data as SearchCommandItemData).tags!.slice(0, 3)"
            :key="tag.id"
            class="text-[10px] px-1.5 py-px rounded-full bg-secondary/60 text-secondary-foreground/70 truncate flex-shrink-0"
          >
            {{ tag.name }}
          </span>
          <span v-if="(item.data as SearchCommandItemData).tags!.length > 3" class="text-[10px] text-muted-foreground/50">
            +{{ (item.data as SearchCommandItemData).tags!.length - 3 }}
          </span>
        </div>
        <div v-else-if="item.description" class="truncate text-xs text-muted-foreground">
          {{ item.description }}
        </div>
      </div>
    </template>
    <template #empty="{ query: q }">
      <div class="py-8 text-center text-sm text-muted-foreground">
        <template v-if="isCommandSearching">
          <div class="i-carbon-circle-dash h-4 w-4 animate-spin mx-auto mb-2 opacity-50" />
          搜索中...
        </template>
        <template v-else-if="q.trim()">
          没有找到 "{{ q }}" 相关结果
        </template>
        <template v-else>
          输入关键词搜索记忆、标签或对话
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center gap-3 text-[11px] text-muted-foreground/60">
        <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted text-[10px]">↑↓</kbd> 导航</span>
        <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted text-[10px]">↵</kbd> 选择</span>
        <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted text-[10px]">esc</kbd> 关闭</span>
      </div>
    </template>
  </CommandPalette>
</template>
