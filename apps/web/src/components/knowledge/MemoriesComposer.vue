<script setup lang="ts">
import type { NoteEditorChange } from '@locus-agent/shared'
import { ref } from 'vue'
import NoteEditor from './NoteEditor.vue'

const composerKey = ref(0)
const composerData = ref<NoteEditorChange | null>(null)

const emit = defineEmits<{
  publish: [data: NoteEditorChange]
}>()

defineExpose({
  composerKey,
  composerData,
  reset,
})

function handleChange(data: NoteEditorChange) {
  composerData.value = data
}

function requestPublish() {
  if (composerData.value)
    emit('publish', composerData.value)
}

function reset() {
  composerData.value = null
  composerKey.value++
}
</script>

<template>
  <div class="mb-8 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
    <div class="composer-editor">
      <NoteEditor
        :key="composerKey"
        @change="handleChange"
      />
    </div>
    <div class="flex items-center justify-between px-2 py-2.5 border-t border-border/50 bg-muted/30">
      <div class="text-xs text-muted-foreground/60">
        支持 Markdown 语法
      </div>
      <slot name="actions" :data="composerData" :request-publish="requestPublish">
        <!-- Parent provides the publish button -->
      </slot>
    </div>
  </div>
</template>
