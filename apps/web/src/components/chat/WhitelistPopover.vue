<script setup lang="ts">
import type { RiskLevel } from '@univedge/locus-agent-sdk'
import { getCommandRiskLevel, getRiskLevel } from '@univedge/locus-agent-sdk'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  toolName: string
  args: Record<string, unknown>
  /** 服务端预计算的建议前缀 */
  suggestedPattern?: string
  /** 服务端预计算的风险等级 */
  riskLevel?: RiskLevel
}>()

const emit = defineEmits<{
  confirm: [payload: { pattern?: string, scope: 'session' | 'global' }]
  cancel: []
}>()

const isBashTool = computed(() => props.toolName === 'bash')

// 可编辑的匹配规则
const pattern = ref(props.suggestedPattern ?? '')
const scope = ref<'session' | 'global'>('session')

// 当 suggestedPattern 变化时同步
watch(() => props.suggestedPattern, (val) => {
  if (val)
    pattern.value = val
})

// 实时计算风险等级
const currentRiskLevel = computed<RiskLevel>(() => {
  if (isBashTool.value) {
    return getCommandRiskLevel(pattern.value)
  }
  return getRiskLevel(props.toolName)
})

// 危险命令不允许添加进全局白名单
const isGlobalDisabled = computed(() => currentRiskLevel.value === 'dangerous')

// 当风险从安全变为危险时，自动切回 session
watch(isGlobalDisabled, (disabled) => {
  if (disabled && scope.value === 'global') {
    scope.value = 'session'
  }
})

const riskConfig = computed(() => {
  switch (currentRiskLevel.value) {
    case 'dangerous':
      return {
        color: 'text-red-600 dark:text-red-400',
        bg: 'bg-red-50 dark:bg-red-950/40',
        border: 'border-red-200 dark:border-red-800',
        icon: 'i-carbon-warning-filled',
        message: `${pattern.value || props.toolName} 是危险命令，可能造成不可恢复的数据丢失`,
      }
    case 'moderate':
      return {
        color: 'text-yellow-700 dark:text-yellow-400',
        bg: 'bg-yellow-50 dark:bg-yellow-950/40',
        border: 'border-yellow-200 dark:border-yellow-800',
        icon: 'i-carbon-warning-alt',
        message: '此命令可能产生副作用，请确认你了解其影响',
      }
    default:
      return null
  }
})

// 匹配说明文字
const matchDescription = computed(() => {
  if (!isBashTool.value) {
    return `所有 ${props.toolName} 工具调用将自动放行`
  }
  if (!pattern.value.trim()) {
    return '将自动放行所有 bash 命令（建议填写前缀缩小范围）'
  }
  return `将自动放行以 "${pattern.value}" 开头的所有 bash 命令`
})

function handleConfirm() {
  emit('confirm', {
    pattern: isBashTool.value ? pattern.value.trim() || undefined : undefined,
    scope: scope.value,
  })
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="w-80 rounded-lg border border-border bg-background shadow-lg p-3 text-sm" @click.stop>
    <!-- Header -->
    <div class="flex items-center gap-1.5 mb-3">
      <div class="i-carbon-filter h-3.5 w-3.5 text-muted-foreground" />
      <span class="font-medium text-foreground">加入白名单</span>
    </div>

    <!-- Tool name -->
    <div class="flex items-center gap-2 mb-2">
      <span class="text-xs text-muted-foreground">工具:</span>
      <code class="text-xs font-mono font-medium text-foreground">{{ toolName }}</code>
    </div>

    <!-- Pattern input (bash only) -->
    <div v-if="isBashTool" class="mb-2">
      <label class="text-xs text-muted-foreground block mb-1">匹配规则:</label>
      <input
        v-model="pattern"
        type="text"
        class="w-full px-2 py-1.5 text-xs font-mono rounded-md border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
        placeholder="命令前缀，如 ls、git status"
      >
      <p class="mt-1 text-[10px] text-muted-foreground/70">
        {{ matchDescription }}
      </p>
    </div>

    <!-- Non-bash tool description -->
    <div v-else class="mb-2">
      <p class="text-xs text-muted-foreground">
        {{ matchDescription }}
      </p>
    </div>

    <!-- Risk warning -->
    <div
      v-if="riskConfig"
      class="mb-3 px-2.5 py-2 rounded-md border text-[11px] leading-relaxed"
      :class="[riskConfig.bg, riskConfig.border, riskConfig.color]"
    >
      <div class="flex items-start gap-1.5">
        <div class="h-3.5 w-3.5 flex-shrink-0 mt-0.5" :class="riskConfig.icon" />
        <span>{{ riskConfig.message }}</span>
      </div>
    </div>

    <!-- Scope selection -->
    <div class="mb-3">
      <span class="text-xs text-muted-foreground block mb-1.5">作用域:</span>
      <div class="space-y-1.5">
        <label class="flex items-center gap-2 cursor-pointer group">
          <input
            v-model="scope"
            type="radio"
            value="session"
            class="accent-foreground"
          >
          <span class="text-xs text-foreground group-hover:text-foreground/80">仅本次会话</span>
        </label>
        <label
          class="flex items-start gap-2"
          :class="isGlobalDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer group'"
        >
          <input
            v-model="scope"
            type="radio"
            value="global"
            :disabled="isGlobalDisabled"
            class="accent-foreground mt-0.5"
          >
          <div>
            <span
              class="text-xs"
              :class="isGlobalDisabled ? 'text-muted-foreground' : 'text-foreground group-hover:text-foreground/80'"
            >
              全局生效（所有会话）
            </span>
            <p v-if="isGlobalDisabled" class="text-[10px] text-red-500 dark:text-red-400 mt-0.5">
              危险命令不允许添加至全局白名单
            </p>
          </div>
        </label>
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center justify-end gap-2 pt-2 border-t border-border">
      <button
        class="px-3 py-1 text-xs font-medium rounded-md border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-150"
        @click="handleCancel"
      >
        取消
      </button>
      <button
        class="px-3 py-1 text-xs font-medium rounded-md bg-neutral-600 hover:bg-neutral-500 dark:bg-neutral-300 dark:hover:bg-neutral-400 text-background transition-colors duration-150"
        @click="handleConfirm"
      >
        确认并执行
      </button>
    </div>
  </div>
</template>
