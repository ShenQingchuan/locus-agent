<script setup lang="ts">
import type { WhitelistRule } from '@locus-agent/shared'
import { getRiskLevel } from '@locus-agent/shared'
import { useToast } from '@locus-agent/ui'
import { onMounted, ref } from 'vue'
import { deleteWhitelistRule, fetchWhitelistRules } from '@/api/whitelist'

const toast = useToast()

const wlRules = ref<WhitelistRule[]>([])
const isWlLoading = ref(false)

async function loadWhitelist() {
  isWlLoading.value = true
  try {
    wlRules.value = await fetchWhitelistRules()
  }
  catch (error) {
    console.error('Failed to load whitelist rules:', error)
  }
  finally {
    isWlLoading.value = false
  }
}

async function onDeleteWhitelistRule(ruleId: string) {
  const success = await deleteWhitelistRule(ruleId)
  if (success) {
    wlRules.value = wlRules.value.filter(r => r.id !== ruleId)
    toast.success('白名单规则已删除')
  }
  else {
    toast.error('删除失败')
  }
}

function wlRiskLabel(rule: WhitelistRule): { text: string, class: string } {
  const risk = getRiskLevel(rule.toolName, rule.pattern)
  switch (risk) {
    case 'dangerous':
      return { text: '危险', class: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950/50' }
    case 'moderate':
      return { text: '中等', class: 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950/50' }
    default:
      return { text: '安全', class: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950/50' }
  }
}

onMounted(() => {
  loadWhitelist()
})
</script>

<template>
  <section class="card p-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-sm font-semibold text-foreground">
          全局白名单
        </h2>
        <p class="text-xs text-muted-foreground mt-0.5">
          自动放行的工具规则
        </p>
      </div>
      <button
        class="btn-ghost btn-icon"
        title="刷新"
        :disabled="isWlLoading"
        @click="loadWhitelist"
      >
        <div class="i-carbon-renew h-4 w-4" :class="isWlLoading ? 'animate-spin' : ''" />
      </button>
    </div>

    <div class="mt-4">
      <div v-if="isWlLoading" class="flex-col-center py-6 text-muted-foreground">
        <div class="i-carbon-circle-dash h-5 w-5 animate-spin opacity-50" />
        <span class="text-xs mt-1.5 opacity-70">加载中...</span>
      </div>

      <div v-else-if="wlRules.length === 0" class="py-6 text-center">
        <div class="i-carbon-filter h-8 w-8 mx-auto text-muted-foreground/30" />
        <p class="text-xs text-muted-foreground/60 mt-2">
          暂无白名单规则
        </p>
        <p class="text-[10px] text-muted-foreground/40 mt-0.5">
          在工具审批时可添加
        </p>
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <div
          v-for="rule in wlRules"
          :key="rule.id"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border bg-muted/30 group leading-none"
        >
          <code
            class="text-xs font-mono leading-none"
            :class="wlRiskLabel(rule).text === '危险' ? 'text-red-500 dark:text-red-400' : 'text-foreground'"
          >{{ rule.toolName }}<span v-if="rule.pattern" class="text-muted-foreground ml-1">{{ rule.pattern }}</span></code>
          <button
            class="h-4 w-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            title="删除"
            @click="onDeleteWhitelistRule(rule.id)"
          >
            <div class="i-carbon-close h-2.5 w-2.5" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
