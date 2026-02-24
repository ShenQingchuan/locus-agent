<script setup lang="ts">
import type { Conversation } from '@locus-agent/shared'
import { computed } from 'vue'
import { useRelativeTime } from '@/composables/useRelativeTime'

const props = defineProps<{
  conversation: Conversation
  isActive?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
}>()

const { relative: formattedTime } = useRelativeTime(
  () => new Date(props.conversation.updatedAt).getTime(),
)

const truncatedTitle = computed(() => {
  const title = props.conversation.title || '新会话'
  return title.length > 24 ? `${title.slice(0, 24)}...` : title
})
</script>

<template>
  <div
    class="relative w-full px-3 py-2.5 rounded-lg transition-colors duration-150 group"
    :class="[
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
    ]"
  >
    <button
      class="w-full text-left pr-7"
      @click="emit('select', conversation.id)"
    >
      <div class="flex items-center gap-2">
        <span class="text-sm truncate">{{ truncatedTitle }}</span>
      </div>
      <div class="mt-0.5 text-xs text-muted-foreground opacity-70">
        {{ formattedTime }}
      </div>
    </button>

    <!-- Delete button -->
    <button
      class="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 rounded-md hover:bg-destructive/15 text-muted-foreground hover:text-destructive hover:scale-105"
      title="删除对话"
      @click.stop="emit('delete', conversation.id)"
    >
      <div class="i-carbon-trash-can h-3.5 w-3.5" />
    </button>
  </div>
</template>
