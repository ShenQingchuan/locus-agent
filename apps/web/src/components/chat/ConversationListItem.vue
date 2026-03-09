<script setup lang="ts">
import type { Conversation } from '@locus-agent/agent-sdk'
import { computed } from 'vue'
import { useRelativeTime } from '@/composables/useRelativeTime'

const props = defineProps<{
  conversation: Conversation
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
  <div class="flex flex-col gap-0.5">
    <div class="flex items-center gap-2">
      <span class="text-sm truncate">{{ truncatedTitle }}</span>
    </div>
    <div class="text-xs text-muted-foreground opacity-70">
      {{ formattedTime }}
    </div>
  </div>
</template>
