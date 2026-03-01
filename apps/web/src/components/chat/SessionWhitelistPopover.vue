<script setup lang="ts">
import type { WhitelistRule } from '@locus-agent/shared'
import { getRiskLevel } from '@locus-agent/shared'
import { onClickOutside } from '@vueuse/core'
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const popoverRef = ref<HTMLElement | null>(null)

onClickOutside(popoverRef, () => emit('close'))

async function handleDelete(ruleId: string) {
  await chatStore.removeWhitelistRule(ruleId)
}

function isDangerous(rule: WhitelistRule): boolean {
  return getRiskLevel(rule.toolName, rule.pattern) === 'dangerous'
}
</script>

<template>
  <div
    ref="popoverRef"
    class="w-72 rounded-lg border border-border bg-background shadow-lg text-sm"
    @click.stop
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-2.5 py-1.5 border-b border-border">
      <span class="text-xs font-medium text-foreground">本会话工具执行白名单</span>
      <button
        class="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        title="关闭"
        @click="emit('close')"
      >
        <div class="i-carbon-close h-3.5 w-3.5" />
      </button>
    </div>

    <!-- Content -->
    <div class="px-3 py-2 max-h-60 overflow-y-auto">
      <div v-if="chatStore.whitelistRules.length === 0" class="py-4 text-center">
        <p class="text-xs text-muted-foreground/60">
          暂无白名单规则
        </p>
        <p class="text-[10px] text-muted-foreground/40 mt-0.5">
          在工具审批时可添加
        </p>
      </div>

      <div v-else class="flex flex-wrap gap-1.5">
        <div
          v-for="rule in chatStore.whitelistRules"
          :key="rule.id"
          class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-border bg-muted/30 group leading-none"
        >
          <code
            class="text-xs font-mono leading-none"
            :class="isDangerous(rule) ? 'text-red-500 dark:text-red-400' : 'text-foreground'"
          >{{ rule.toolName }}<span v-if="rule.pattern" class="text-muted-foreground ml-1">{{ rule.pattern }}</span></code>
          <template v-if="rule.scope === 'global'">
            <div class="w-px h-3 bg-muted-foreground/20" />
            <span class="text-[10px] leading-none text-muted-foreground/70 font-sans">全局</span>
          </template>
          <button
            class="h-3.5 w-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            title="删除"
            @click="handleDelete(rule.id)"
          >
            <div class="i-carbon-close h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
