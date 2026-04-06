<script setup lang="ts">
import type { ReviewAnnotationGroup } from '@/composables/useReviewAnnotations'
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  /** Side of the diff: additions or deletions */
  side: 'additions' | 'deletions'
  lineStart: number
  lineEnd: number
  groups: ReviewAnnotationGroup[]
  activeGroupId: string | null
}>()

const emit = defineEmits<{
  close: []
  submit: [payload: { groupId: string, comment: string }]
  createGroup: [payload: { comment: string }]
}>()

const comment = ref('')
const selectedGroupId = ref<string | null>(null)
const isCreatingGroup = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const rangeLabel = computed(() => {
  if (props.lineStart === props.lineEnd)
    return `第 ${props.lineStart} 行`
  return `第 ${props.lineStart}–${props.lineEnd} 行`
})

const sideLabel = computed(() => props.side === 'additions' ? '新增' : '删除')

watch(() => props.open, async (open) => {
  if (open) {
    comment.value = ''
    selectedGroupId.value = props.activeGroupId ?? props.groups[0]?.id ?? null
    isCreatingGroup.value = props.groups.length === 0
    await nextTick()
    textareaRef.value?.focus()
  }
})

function handleSubmit() {
  const trimmedComment = comment.value.trim()
  if (!trimmedComment)
    return

  if (isCreatingGroup.value) {
    emit('createGroup', { comment: trimmedComment })
  }
  else if (selectedGroupId.value) {
    emit('submit', { groupId: selectedGroupId.value, comment: trimmedComment })
  }
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    handleSubmit()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="popover-slide">
      <div
        v-if="open"
        class="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
        @click.self="emit('close')"
        @keydown="handleKeydown"
      >
        <div
          class="popover-panel w-full sm:w-[420px] sm:max-w-[90vw] bg-popover border border-border rounded-t-xl sm:rounded-xl shadow-xl"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div class="flex items-center gap-2 text-sm">
              <span class="i-carbon-pen h-3.5 w-3.5 text-primary" />
              <span class="font-medium">添加批注</span>
              <span class="text-xs text-muted-foreground">
                {{ rangeLabel }} · {{ sideLabel }}侧
              </span>
            </div>
            <button
              class="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('close')"
            >
              <span class="i-carbon-close h-3.5 w-3.5" />
            </button>
          </div>

          <!-- Body -->
          <div class="px-4 py-3 space-y-3">
            <!-- Group selector -->
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">意见组</label>
              <div v-if="!isCreatingGroup && groups.length > 0" class="flex items-center gap-2">
                <select
                  v-model="selectedGroupId"
                  class="flex-1 h-8 px-2 text-xs bg-muted border border-border rounded-md text-foreground appearance-none cursor-pointer"
                >
                  <option
                    v-for="(group, gi) in groups"
                    :key="group.id"
                    :value="group.id"
                  >
                    #{{ gi + 1 }} ({{ group.annotations.length }})
                  </option>
                </select>
                <button
                  class="h-8 px-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                  @click="isCreatingGroup = true"
                >
                  新建组
                </button>
              </div>
              <div
                v-else
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <span class="tabular-nums">新建意见组 #{{ groups.length + 1 }}</span>
                <button
                  v-if="groups.length > 0"
                  type="button"
                  class="ml-auto h-8 px-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                  @click="isCreatingGroup = false"
                >
                  选已有
                </button>
              </div>
            </div>

            <!-- Comment input -->
            <div class="space-y-1.5">
              <label class="text-xs font-medium text-muted-foreground">审阅意见</label>
              <textarea
                ref="textareaRef"
                v-model="comment"
                class="w-full h-24 px-3 py-2 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                placeholder="输入你的修改意见..."
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-between px-4 py-2.5 border-t border-border">
            <span class="text-xs text-muted-foreground/60">
              ⌘+Enter 提交
            </span>
            <div class="flex items-center gap-2">
              <button
                class="h-7 px-3 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                @click="emit('close')"
              >
                取消
              </button>
              <button
                class="h-7 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!comment.trim()"
                @click="handleSubmit"
              >
                添加批注
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popover-slide-enter-active,
.popover-slide-leave-active {
  transition: opacity 0.2s ease;
}
.popover-slide-enter-active .popover-panel,
.popover-slide-leave-active .popover-panel {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
}
.popover-slide-enter-from,
.popover-slide-leave-to {
  opacity: 0;
}
.popover-slide-enter-from .popover-panel,
.popover-slide-leave-to .popover-panel {
  transform: translateY(16px);
  opacity: 0;
}
</style>
