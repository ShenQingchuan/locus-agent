<script setup lang="ts">
import { Modal } from '@locus-agent/ui'
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

function handleClose() {
  emit('close')
}
</script>

<template>
  <Modal
    :open="open"
    max-width="max-w-sm"
    @close="handleClose"
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
    >
    <div class="mt-4 flex justify-end gap-2">
      <button
        class="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
        @click="handleClose"
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
  </Modal>
</template>
