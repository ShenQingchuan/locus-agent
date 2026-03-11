<script setup lang="ts">
import { Tooltip } from '@univedge/locus-ui'
import { computed } from 'vue'

const props = defineProps<{
  used: number
  total: number
}>()

const percentage = computed(() => {
  if (props.total <= 0)
    return 0
  return Math.min(100, (props.used / props.total) * 100)
})

// SVG 圆环参数
const size = 16
const strokeWidth = 3
const radius = (size - strokeWidth) / 2
const circumference = 2 * Math.PI * radius

// 可见（白色）弧的长度
const dashLength = computed(() => {
  return (percentage.value / 100) * circumference
})

const tooltipText = computed(() => {
  return `上下文空间：${props.used} / ${props.total}`
})
</script>

<template>
  <Tooltip :content="tooltipText">
    <div class="cursor-pointer">
      <svg
        :width="size"
        :height="size"
        class="transform -rotate-90"
      >
        <!-- 背景圆环（灰色） -->
        <circle
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          stroke="currentColor"
          :stroke-width="strokeWidth"
          class="text-muted-foreground/30"
        />
        <!-- 进度圆环（白色） -->
        <circle
          v-if="percentage > 0"
          :cx="size / 2"
          :cy="size / 2"
          :r="radius"
          fill="none"
          stroke="currentColor"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          :stroke-dasharray="`${dashLength} ${circumference}`"
          class="text-foreground transition-all duration-300"
        />
      </svg>
    </div>
  </Tooltip>
</template>
