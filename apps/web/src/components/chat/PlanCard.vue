<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  filename: string
  content: string
  status: 'pending' | 'completed' | 'error'
}>()

const chatStore = useChatStore()

const planTitle = computed(() => {
  const match = props.content.match(/^#\s+(\S.*)$/m)
  return match?.[1]?.trim() || props.filename.replace(/\.md$/, '')
})

const planSummary = computed(() => {
  const lines = props.content.split('\n')
  let pastHeading = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (!pastHeading && trimmed.startsWith('# ')) {
      pastHeading = true
      continue
    }
    if (pastHeading && trimmed && !trimmed.startsWith('#')) {
      const text = trimmed.replace(/^[-*>\s]+/, '')
      return text.length > 80 ? `${text.slice(0, 80)}...` : text
    }
  }
  return '点击查看完整计划'
})

function handleViewPlan() {
  if (props.status === 'completed') {
    chatStore.openPlan(props.filename, props.content)
  }
}

function handleStartExecution() {
  chatStore.setCodingMode('build')
}
</script>

<template>
  <div
    class="my-2 rounded-lg border border-border overflow-hidden"
    :class="status === 'error' ? 'border-destructive/30' : ''"
  >
    <!-- Card body -->
    <div
      class="px-3.5 py-3 transition-colors"
      :class="status === 'completed' ? 'cursor-pointer hover:bg-muted/30' : ''"
      @click="handleViewPlan"
    >
      <div class="flex items-center gap-3">
        <div class="flex-shrink-0">
          <div
            v-if="status === 'pending'"
            class="i-svg-spinners:bars-fade h-4 w-4 text-muted-foreground"
          />
          <div
            v-else-if="status === 'error'"
            class="i-carbon-warning-alt h-4 w-4 text-destructive"
          />
          <div
            v-else
            class="i-icon-park-solid:guide-board h-4 w-4 text-primary"
          />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-foreground truncate">{{ planTitle }}</span>
            <span v-if="status === 'pending'" class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal flex-shrink-0">
              生成中...
            </span>
            <span v-else-if="status === 'error'" class="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal flex-shrink-0">
              生成失败
            </span>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5 truncate">
            {{ planSummary }}
          </p>
        </div>
        <div
          v-if="status === 'completed'"
          class="flex-shrink-0 i-carbon-chevron-right h-3.5 w-3.5 text-muted-foreground/50"
        />
      </div>
    </div>

    <!-- Action bar -->
    <div
      v-if="status === 'completed'"
      class="flex items-center gap-2 px-3.5 py-2 border-t border-border bg-muted/20"
    >
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        @click.stop="handleStartExecution"
      >
        <div class="i-carbon-play-filled-alt h-3 w-3" />
        开始执行
      </button>
    </div>
  </div>
</template>
