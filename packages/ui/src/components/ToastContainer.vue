<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { nextTick, watch } from 'vue'
import { useToast } from '../composables/useToast'

const { toasts, confirmState, promptState, remove, removeAll, resolveConfirm, resolvePrompt } = useToast()

let promptInputRef: HTMLInputElement | HTMLTextAreaElement | null = null

function setPromptInputRef(el: any) {
  promptInputRef = el as HTMLInputElement | HTMLTextAreaElement | null
}

watch(() => promptState.value.visible, async (visible) => {
  if (visible) {
    await nextTick()
    promptInputRef?.focus()
  }
})

function handlePromptConfirm() {
  const value = promptState.value.inputValue.trim()
  if (value) {
    resolvePrompt(value)
  }
}

onKeyStroke('Escape', (e) => {
  if (promptState.value.visible) {
    e.preventDefault()
    resolvePrompt(null)
  }
  else if (confirmState.value.visible) {
    e.preventDefault()
    resolveConfirm(false)
  }
  else if (toasts.value.length > 0) {
    e.preventDefault()
    removeAll()
  }
})

onKeyStroke('Enter', (e) => {
  if (promptState.value.visible) {
    // handled by input @keydown.enter
    return
  }
  if (confirmState.value.visible) {
    e.preventDefault()
    resolveConfirm(true)
  }
})

function getToastIcon(type: string): string {
  switch (type) {
    case 'success':
      return 'i-carbon-checkmark-filled'
    case 'error':
      return 'i-carbon-close-filled'
    case 'warning':
      return 'i-carbon-warning-filled'
    default:
      return 'i-carbon-information-filled'
  }
}

function getToastClass(type: string): string {
  switch (type) {
    case 'success':
      return 'text-green-600 dark:text-green-500'
    case 'error':
      return 'text-destructive'
    case 'warning':
      return 'text-orange-500'
    default:
      return 'text-primary'
  }
}
</script>

<template>
  <!-- Toast 消息列表 -->
  <Teleport to="body">
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg bg-background border border-border shadow-lg w-max max-w-80vw"
        >
          <div
            class="h-4 w-4 flex-shrink-0"
            :class="[getToastIcon(toast.type), getToastClass(toast.type)]"
          />
          <span class="text-sm text-foreground break-words max-w-70vw">{{ toast.message }}</span>
          <button
            class="ml-2 text-muted-foreground hover:text-foreground transition-colors"
            @click="remove(toast.id)"
          >
            <div class="i-carbon-close h-3.5 w-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>

    <!-- 确认对话框 -->
    <Transition name="fade">
      <div
        v-if="confirmState.visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <!-- 遮罩 -->
        <div
          class="absolute inset-0 bg-black/50"
          @click="resolveConfirm(false)"
        />

        <!-- 对话框 -->
        <div class="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
          <div class="flex items-start gap-3">
            <div
              class="h-5 w-5 flex-shrink-0 mt-0.5"
              :class="[
                confirmState.options.type === 'error' ? 'i-carbon-close-filled text-destructive'
                : confirmState.options.type === 'success' ? 'i-carbon-checkmark-filled text-green-600 dark:text-green-500'
                  : 'i-carbon-warning-filled text-orange-500',
              ]"
            />
            <div class="flex-1">
              <h3 class="text-base font-medium text-foreground">
                {{ confirmState.options.title }}
              </h3>
              <p class="mt-1.5 text-sm text-muted-foreground">
                {{ confirmState.options.message }}
              </p>
            </div>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              class="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
              @click="resolveConfirm(false)"
            >
              {{ confirmState.options.cancelText }}
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md transition-colors"
              :class="[
                confirmState.options.type === 'error'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90',
              ]"
              @click="resolveConfirm(true)"
            >
              {{ confirmState.options.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 输入对话框 -->
    <Transition name="fade">
      <div
        v-if="promptState.visible"
        class="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          class="absolute inset-0 bg-black/50"
          @click="resolvePrompt(null)"
        />

        <div
          class="relative bg-background border border-border rounded-lg shadow-xl w-full mx-4 p-5"
          :class="promptState.options.multiline ? 'max-w-md' : 'max-w-sm'"
        >
          <h3 class="text-base font-medium text-foreground">
            {{ promptState.options.title }}
          </h3>
          <p v-if="promptState.options.message" class="mt-1.5 text-sm text-muted-foreground">
            {{ promptState.options.message }}
          </p>

          <!-- Multiline: textarea -->
          <textarea
            v-if="promptState.options.multiline"
            :ref="setPromptInputRef"
            v-model="promptState.inputValue"
            rows="4"
            class="mt-3 w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground font-sans outline-none focus:ring-1 focus:ring-ring resize-y min-h-20"
            :placeholder="promptState.options.placeholder"
            @keydown.enter.meta.prevent="handlePromptConfirm"
            @keydown.enter.ctrl.prevent="handlePromptConfirm"
          />

          <!-- Single line: input -->
          <input
            v-else
            :ref="setPromptInputRef"
            v-model="promptState.inputValue"
            type="text"
            class="mt-3 w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground font-sans outline-none focus:ring-1 focus:ring-ring"
            :placeholder="promptState.options.placeholder"
            @keydown.enter.prevent="handlePromptConfirm"
          >

          <div class="mt-4 flex items-center">
            <div class="flex gap-2 ml-auto">
              <button
                class="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-muted transition-colors"
                @click="resolvePrompt(null)"
              >
                {{ promptState.options.cancelText }}
              </button>
              <button
                class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!promptState.inputValue.trim()"
                @click="handlePromptConfirm"
              >
                {{ promptState.options.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
