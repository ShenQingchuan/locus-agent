<script setup lang="ts">
import ConversationList from '@/components/chat/ConversationList.vue'

defineProps<{
  open: boolean
  conversations: import('@univedge/locus-agent-sdk').Conversation[]
  currentId?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
  delete: [id: string]
}>()
</script>

<template>
  <Transition name="history-panel">
    <div
      v-if="open"
      class="absolute right-0 top-11 bottom-0 w-72 border-l border-border bg-sidebar-background flex flex-col shadow-xl z-20"
    >
      <div class="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span class="text-sm font-medium">项目会话历史</span>
        <button
          class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          @click="emit('close')"
        >
          <span class="i-carbon-close h-3.5 w-3.5" />
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <ConversationList
          :conversations="conversations"
          :current-id="currentId"
          :loading="loading"
          :virtual-scroll="true"
          :item-height="58"
          class="h-full"
          @select="emit('select', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.history-panel-enter-active,
.history-panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.history-panel-enter-from,
.history-panel-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
