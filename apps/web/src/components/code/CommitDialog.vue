<script setup lang="ts">
import { ref } from 'vue'
import { suggestCommitMessage } from '@/api/workspace'

const props = defineProps<{
  stagedCount: number
  workspacePath: string
}>()

const emit = defineEmits<{
  confirm: [message: string]
  cancel: []
}>()

const message = ref('')
const isGenerating = ref(false)
const generateError = ref<string | null>(null)

async function handleGenerate() {
  if (isGenerating.value)
    return
  isGenerating.value = true
  generateError.value = null
  try {
    const result = await suggestCommitMessage(props.workspacePath)
    message.value = result.message
  }
  catch (err) {
    generateError.value = err instanceof Error ? err.message : '生成失败'
  }
  finally {
    isGenerating.value = false
  }
}

function handleConfirm() {
  const trimmed = message.value.trim()
  if (!trimmed)
    return
  emit('confirm', trimmed)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.self="emit('cancel')">
    <div class="w-full max-w-lg mx-4 rounded-xl border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 class="text-sm font-semibold text-foreground">
            提交变更
          </h2>
          <p class="text-xs text-muted-foreground mt-0.5">
            将提交 {{ stagedCount }} 个暂存文件
          </p>
        </div>
        <button
          class="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          @click="emit('cancel')"
        >
          <span class="i-carbon-close h-4 w-4" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-4 space-y-3">
        <!-- Commit message textarea -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-muted-foreground">提交信息</label>
            <span class="text-xs text-muted-foreground/60">建议遵照规范：&lt;type&gt;(scope): &lt;subject&gt;</span>
          </div>
          <textarea
            v-model="message"
            class="w-full min-h-[80px] resize-y rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            placeholder="feat(auth): add login with email verification"
            rows="3"
            autofocus
            @keydown.meta.enter="handleConfirm"
            @keydown.ctrl.enter="handleConfirm"
          />
        </div>

        <!-- AI generate button + error -->
        <div class="flex items-center gap-2">
          <button
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isGenerating"
            @click="handleGenerate"
          >
            <span
              class="h-3.5 w-3.5"
              :class="isGenerating ? 'i-carbon-circle-dash animate-spin' : 'i-carbon-ai-generate'"
            />
            {{ isGenerating ? 'AI 生成中…' : '生成提交信息' }}
          </button>
          <span v-if="generateError" class="text-xs text-destructive">{{ generateError }}</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/20">
        <button
          class="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          class="px-4 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!message.trim()"
          @click="handleConfirm"
        >
          提交
        </button>
      </div>
    </div>
  </div>
</template>
