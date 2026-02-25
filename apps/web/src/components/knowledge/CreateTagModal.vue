<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  create: [name: string]
  close: []
}>()

const input = ref('')

watch(() => props.open, (open) => {
  if (open)
    input.value = ''
  else
    input.value = ''
})

function handleSubmit() {
  const name = input.value.trim()
  if (name) {
    emit('create', name)
    emit('close')
  }
}

function handleCancel() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="handleCancel"
    >
      <div
        class="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
        @click.stop
      >
        <h3 class="text-sm font-semibold text-foreground mb-3">
          新建标签
        </h3>
        <input
          v-model="input"
          type="text"
          placeholder="标签名称"
          class="w-full h-9 px-3 rounded-md border border-border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          autofocus
          @keydown.enter="handleSubmit"
          @keydown.escape="handleCancel"
        >
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            class="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            :disabled="!input.trim()"
            @click="handleSubmit"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
