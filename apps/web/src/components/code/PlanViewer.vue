<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { computed } from 'vue'

const props = defineProps<{
  filename: string
  content: string
}>()

const emit = defineEmits<{
  close: []
}>()

const planTitle = computed(() => {
  const match = props.content.match(/^#\s+(\S.*)$/m)
  return match?.[1]?.trim() || props.filename.replace(/\.md$/, '')
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <header class="h-11 border-b border-border px-4 flex items-center gap-2 flex-shrink-0">
      <button
        class="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="返回"
        @click="emit('close')"
      >
        <span class="i-carbon-arrow-left h-3.5 w-3.5" />
      </button>
      <h1 class="text-sm font-semibold truncate">
        {{ planTitle }}
      </h1>
    </header>

    <!-- Content -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-3xl mx-auto px-6 py-6 prose prose-sm dark:prose-invert">
        <MarkdownRender :content="content" custom-id="locus" />
      </div>
    </div>
  </div>
</template>
