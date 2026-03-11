<script setup lang="ts">
import { Modal } from '@univedge/locus-ui'
import { computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  isError?: boolean
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval' | 'awaiting-question' | 'interrupted'
  /** 若结果已通过外部 widget 展示，则 modal 内不再重复显示 */
  hideResult?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

watch(() => props.visible, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

const formattedArgs = computed(() => {
  try {
    return JSON.stringify(props.args, null, 2)
  }
  catch {
    return String(props.args)
  }
})

const formattedResult = computed(() => {
  if (props.result === undefined)
    return ''
  if (typeof props.result === 'string')
    return props.result
  try {
    return JSON.stringify(props.result, null, 2)
  }
  catch {
    return String(props.result)
  }
})

const statusIcon = computed(() => {
  switch (props.status) {
    case 'pending': return 'i-carbon-hourglass'
    case 'awaiting-approval': return 'i-carbon-warning-alt'
    case 'awaiting-question': return 'i-carbon-help'
    case 'completed': return 'i-carbon-checkmark'
    case 'error': return 'i-carbon-close'
    case 'interrupted': return 'i-solar:forbidden-circle-linear'
    default: return 'i-carbon-tool-box'
  }
})

const statusIconClass = computed(() => {
  switch (props.status) {
    case 'pending': return 'text-muted-foreground animate-spin'
    case 'error': return 'text-destructive'
    case 'interrupted': return 'text-yellow-500'
    default: return 'text-muted-foreground'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'pending': return '执行中'
    case 'awaiting-approval': return '等待确认'
    case 'awaiting-question': return '等待回答'
    case 'completed': return '已完成'
    case 'error': return '错误'
    case 'interrupted': return '已中断'
    default: return ''
  }
})
</script>

<template>
  <Modal
    :open="visible"
    max-width="max-w-2xl"
    panel-class="rounded-xl border-white/10 shadow-2xl"
    @close="emit('close')"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 px-2 py-3 border-b border-white/10 flex-shrink-0">
      <div
        class="h-4 w-4 flex-shrink-0"
        :class="[statusIcon, statusIconClass]"
      />
      <code class="text-sm font-mono font-medium text-foreground">{{ toolName }}</code>
      <span class="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full leading-normal">
        {{ statusLabel }}
      </span>
      <button
        class="ml-2 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        @click="emit('close')"
      >
        <div class="i-carbon-close h-4 w-4" />
      </button>
    </div>

    <!-- Content -->
    <div class="overflow-y-auto flex-1 p-4 space-y-4">
      <section>
        <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          参数
        </h3>
        <pre class="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all overflow-y-auto max-h-60 text-foreground">{{ formattedArgs }}</pre>
      </section>

      <!-- Results -->
      <section v-if="result !== undefined && !hideResult">
        <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          结果
        </h3>
        <pre class="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all overflow-y-auto max-h-60 text-foreground">{{ formattedResult }}</pre>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
/* Keep modal transitions from original */
:deep(.modal-enter-active),
:deep(.modal-leave-active) {
  transition: opacity 150ms ease;
}

:deep(.modal-enter-from),
:deep(.modal-leave-to) {
  opacity: 0;
}

:deep(.modal-enter-active) .relative,
:deep(.modal-leave-active) .relative {
  transition: opacity 150ms ease, transform 150ms ease;
}

:deep(.modal-enter-from) .relative,
:deep(.modal-leave-to) .relative {
  transform: scale(0.96);
}
</style>
