<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { computed, watch } from 'vue'
import DiffViewer from './DiffViewer.vue'

const props = defineProps<{
  visible: boolean
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  isError?: boolean
  status: 'pending' | 'completed' | 'error' | 'awaiting-approval'
}>()

/** Whether this tool call is an edit_file with a patch */
const isEditFilePatch = computed(() =>
  props.toolName === 'edit_file' && typeof props.args.patch === 'string',
)

/** File path for edit_file tool */
const editFilePath = computed(() =>
  isEditFilePatch.value ? String(props.args.file_path ?? '') : '',
)

/** Patch string for edit_file tool */
const editFilePatch = computed(() =>
  isEditFilePatch.value ? String(props.args.patch) : '',
)

const emit = defineEmits<{
  close: []
}>()

onKeyStroke('Escape', (e) => {
  if (props.visible) {
    e.preventDefault()
    emit('close')
  }
})

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
    case 'completed': return 'i-carbon-checkmark'
    case 'error': return 'i-carbon-close'
    default: return 'i-carbon-tool-box'
  }
})

const statusIconClass = computed(() => {
  switch (props.status) {
    case 'pending': return 'text-muted-foreground animate-spin'
    case 'error': return 'text-destructive'
    default: return 'text-muted-foreground'
  }
})

const statusLabel = computed(() => {
  switch (props.status) {
    case 'pending': return '执行中'
    case 'awaiting-approval': return '等待确认'
    case 'completed': return '已完成'
    case 'error': return '错误'
    default: return ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/40 backdrop-blur-sm"
          @click="emit('close')"
        />

        <!-- Panel -->
        <div class="relative bg-background border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0">
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
            <!-- edit_file: render patch with DiffViewer -->
            <template v-if="isEditFilePatch">
              <section v-if="editFilePath">
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  文件
                </h3>
                <code class="text-xs font-mono text-foreground">{{ editFilePath }}</code>
              </section>

              <section>
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  变更
                </h3>
                <div class="rounded-md overflow-hidden border border-border">
                  <DiffViewer :patch="editFilePatch" :file-path="editFilePath" />
                </div>
              </section>
            </template>

            <!-- Generic tool: raw JSON parameters -->
            <template v-else>
              <section>
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  参数
                </h3>
                <pre class="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all overflow-y-auto max-h-60 text-foreground">{{ formattedArgs }}</pre>
              </section>
            </template>

            <!-- Results -->
            <section v-if="result !== undefined">
              <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                结果
              </h3>
              <pre class="text-xs font-mono bg-muted rounded-md p-3 whitespace-pre-wrap break-all overflow-y-auto max-h-60 text-foreground">{{ formattedResult }}</pre>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 150ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: opacity 150ms ease, transform 150ms ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.96);
}
</style>
