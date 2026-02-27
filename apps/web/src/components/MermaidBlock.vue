<script setup lang="ts">
import { useDark } from '@vueuse/core'
import { MermaidBlockNode } from 'markstream-vue'
import { ref } from 'vue'

const props = defineProps<{
  node: any
}>()

const isDark = useDark()

const copied = ref(false)

function handleCopy(ev: any) {
  ev.preventDefault()
  const text = ev.payload?.text ?? props.node.code ?? ''
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }).catch(() => {})
}
</script>

<template>
  <MermaidBlockNode
    :node="node"
    :is-dark="isDark"
    is-strict
    show-mode-toggle
    show-zoom-controls
    show-fullscreen-button
    show-copy-button
    show-collapse-button
    :show-export-button="false"
    class="mermaid-block my-3 overflow-hidden"
    @copy="handleCopy"
  >
    <template #header-left>
      <span class="font-mono">Mermaid</span>
    </template>
  </MermaidBlockNode>
</template>

<style>
.mermaid-block {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border, hsl(0 0% 89.8%));
}

html.dark .mermaid-block {
  border-color: var(--color-border, hsl(0 0% 14.9%));
}

.mermaid-block svg {
  max-width: 100%;
  height: auto;
}
</style>
