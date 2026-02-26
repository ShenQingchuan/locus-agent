<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  toolName: string
  input: string
  output?: string
  isError?: boolean
  /** 父级子代理是否已完成（影响状态显示） */
  parentCompleted?: boolean
}>()

const isExpanded = ref(false)

// 格式化输入内容显示（只显示第一行或前 60 字符）
const inputSummary = computed(() => {
  try {
    const parsed = JSON.parse(props.input)
    // 优先显示 command（bash）、file_path（read/write）等关键字段
    const keyFields = ['command', 'file_path', 'pattern', 'task', 'query']
    for (const field of keyFields) {
      if (parsed[field]) {
        const value = String(parsed[field])
        return value.length > 50 ? `${value.slice(0, 50)}...` : value
      }
    }
    // 如果没有关键字段，显示整个 JSON 的第一行
    const jsonStr = JSON.stringify(parsed)
    return jsonStr.length > 50 ? `${jsonStr.slice(0, 50)}...` : jsonStr
  }
  catch {
    return props.input.length > 50 ? `${props.input.slice(0, 50)}...` : props.input
  }
})

// 检测是否为超时错误
const isTimeoutError = computed(() => {
  if (!props.isError || !props.output)
    return false
  return props.output.includes('timed out') || props.output.includes('超时')
})

// 状态样式
const statusConfig = computed(() => {
  // 无输出时
  if (props.output === undefined) {
    // 父级已完成但此工具无输出 → 显示为未完成（无 spinner）
    if (props.parentCompleted) {
      return {
        icon: 'i-carbon-minus',
        iconClass: 'text-muted-foreground',
        label: '未完成',
      }
    }
    // 父级进行中 → 显示为执行中（有 spinner）
    return {
      icon: 'i-carbon-hourglass',
      iconClass: 'animate-spin text-amber-500',
      label: '执行中',
    }
  }
  // 有输出但出错
  if (props.isError) {
    // 超时错误使用特殊样式
    if (isTimeoutError.value) {
      return {
        icon: 'i-carbon-time',
        iconClass: 'text-orange-500',
        label: '超时',
      }
    }
    return {
      icon: 'i-carbon-close',
      iconClass: 'text-red-500',
      label: '失败',
    }
  }
  // 成功完成
  return {
    icon: 'i-carbon-checkmark',
    iconClass: 'text-green-500',
    label: '成功',
  }
})
</script>

<template>
  <div class="px-3 py-2">
    <!-- Summary row -->
    <div
      class="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors"
      @click="isExpanded = !isExpanded"
    >
      <div class="h-3 w-3 flex-shrink-0" :class="[statusConfig.icon, statusConfig.iconClass]" />
      <code class="text-xs font-mono text-primary">{{ toolName }}</code>
      <span class="text-xs text-muted-foreground truncate flex-1">
        {{ inputSummary }}
      </span>
      <div
        class="h-3 w-3 text-muted-foreground transition-transform duration-200 i-carbon-chevron-down"
        :class="[isExpanded ? 'rotate-180' : '']"
      />
    </div>

    <!-- Expanded details -->
    <div v-if="isExpanded" class="mt-2 space-y-2">
      <!-- Input -->
      <div>
        <div class="text-[10px] text-muted-foreground/70 mb-1">
          参数
        </div>
        <pre class="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap">{{ input }}</pre>
      </div>

      <!-- Output -->
      <div v-if="output !== undefined">
        <div class="text-[10px] text-muted-foreground/70 mb-1">
          {{ isTimeoutError ? '超时信息' : isError ? '错误' : '结果' }}
        </div>
        <pre
          class="text-[10px] font-mono rounded px-2 py-1 overflow-x-auto whitespace-pre-wrap"
          :class="isTimeoutError ? 'bg-orange-500/10 text-orange-600' : isError ? 'bg-red-500/10 text-red-600' : 'bg-muted/50 text-muted-foreground'"
        >{{ output }}</pre>
      </div>

      <!-- Loading or incomplete -->
      <div v-else class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <div v-if="!parentCompleted" class="i-svg-spinners:bars-fade h-3 w-3" />
        <span>{{ parentCompleted ? '执行结果未记录' : '等待执行结果...' }}</span>
      </div>
    </div>
  </div>
</template>
