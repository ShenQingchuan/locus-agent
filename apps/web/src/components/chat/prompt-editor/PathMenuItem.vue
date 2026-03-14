<script setup lang="ts">
import type { WorkspaceMentionItem } from './types'
import { AutocompleteItem } from 'prosekit/vue/autocomplete'

defineProps<{
  item: WorkspaceMentionItem
}>()
</script>

<template>
  <AutocompleteItem
    class="path-menu-item"
    :value="item.searchText"
  >
    <div class="flex items-center gap-1.5 px-2 py-1">
      <div
        class="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
        :class="item.icon"
      />
      <span class="truncate text-xs text-foreground font-mono">{{ item.label }}</span>
    </div>
  </AutocompleteItem>
</template>

<style>
.path-menu-item {
  cursor: pointer;
  border-radius: 0.25rem;
  transition: background-color 0.1s;
}

.path-menu-item:hover,
.path-menu-item[data-focused],
.path-menu-item[aria-selected="true"] {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
</style>
