<script setup lang="ts">
import type { SlashMenuCommand } from './types'
import { AutocompleteItem } from 'prosekit/vue/autocomplete'

defineProps<{
  command: SlashMenuCommand
}>()
</script>

<template>
  <AutocompleteItem
    class="slash-menu-item"
    :value="command.name"
  >
    <div class="flex items-center gap-2 px-2.5 py-1.5">
      <div
        v-if="command.icon"
        class="h-4 w-4 flex-shrink-0 text-muted-foreground"
        :class="command.icon"
      />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium text-foreground truncate">{{ command.name }}</span>
          <span
            v-if="command.badge"
            class="flex-shrink-0 rounded-full px-1.5 py-0 text-[10px] leading-4"
            :class="{
              'bg-blue-500/10 text-blue-600 dark:text-blue-400': command.badgeVariant === 'info',
              'bg-amber-500/10 text-amber-600 dark:text-amber-400': command.badgeVariant === 'warning',
              'bg-muted text-muted-foreground': !command.badgeVariant || command.badgeVariant === 'default',
            }"
          >
            {{ command.badge }}
          </span>
        </div>
        <p v-if="command.description" class="text-xs text-muted-foreground truncate mt-0.5">
          {{ command.description }}
        </p>
      </div>
    </div>
  </AutocompleteItem>
</template>

<style>
.slash-menu-item {
  cursor: pointer;
  border-radius: 0.375rem;
  transition: background-color 0.1s;
}

.slash-menu-item:hover,
.slash-menu-item[data-focused],
.slash-menu-item[aria-selected="true"] {
  background-color: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}
</style>
