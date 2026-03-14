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
    <div class="flex items-center gap-2 px-2.5 py-1.5">
      <div
        class="h-4 w-4 flex-shrink-0 text-muted-foreground"
        :class="item.icon"
      />
      <span class="truncate text-sm text-foreground font-mono">{{ item.label }}</span>
    </div>
  </AutocompleteItem>
</template>

<style>
.path-menu-item {
  cursor: pointer;
  border-radius: 0.375rem;
  transition: background-color 0.1s;
}

.path-menu-item:hover,
.path-menu-item[data-focused],
.path-menu-item[aria-selected="true"] {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
</style>
