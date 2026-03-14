<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import { createEditor } from 'prosekit/core'
import { definePlaceholder } from 'prosekit/extensions/placeholder'
import { ProseKit, useDocChange, useExtension } from 'prosekit/vue'
import { computed, markRaw, watch } from 'vue'
import PathMenu from './PathMenu.vue'
import SlashMenu from './SlashMenu.vue'
import { definePromptExtension } from './usePromptExtension'

import 'prosekit/extensions/placeholder/style.css'

const props = defineProps<{
  placeholder?: string
  disabled?: boolean
  modelValue?: string
  workspaceRoot?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'submit': []
  'escape': []
  'shiftTab': []
}>()

const editor = markRaw(createEditor({
  extension: definePromptExtension({
    placeholder: props.placeholder ?? '',
    onSubmit: () => {
      if (props.disabled)
        return false
      emit('submit')
      return true
    },
    onEscape: () => {
      emit('escape')
      return true
    },
    onShiftTab: () => {
      emit('shiftTab')
      return true
    },
  }),
}))

// Dynamic placeholder: re-apply when props.placeholder changes
const dynamicPlaceholder = computed(() =>
  definePlaceholder({ placeholder: props.placeholder ?? '' }),
)
useExtension(dynamicPlaceholder, { editor })

// Track text changes and emit v-model updates
useDocChange((doc) => {
  const text = extractPlainText(doc)
  emit('update:modelValue', text)
}, { editor })

// When modelValue is set externally (e.g. edit mode), sync to editor
watch(() => props.modelValue, (newVal) => {
  if (newVal === undefined)
    return
  const currentText = extractPlainText(editor.view?.state?.doc)
  if (newVal !== currentText) {
    setEditorText(newVal)
  }
})

function mountEditor(
  ref: Element | ComponentPublicInstance | null,
): void {
  const place = ref && '$el' in ref ? (ref as ComponentPublicInstance).$el as Element | null : ref
  editor.mount(place as HTMLElement | null | undefined)
}

function extractPlainText(doc: any): string {
  if (!doc)
    return ''

  const parts: string[] = []

  function walk(node: any) {
    if (node.isText) {
      parts.push(node.text || '')
      return
    }
    if (node.type?.name === 'mention') {
      const kind = node.attrs?.kind
      const id = node.attrs?.id
      if ((kind === 'file-mention' || kind === 'dir-mention') && id) {
        parts.push(kind === 'dir-mention' ? `@${id}/` : `@${id}`)
      }
      else {
        parts.push(node.attrs?.value || '')
      }
      return
    }
    if (node.type?.name === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (node.content) {
      node.content.forEach((child: any) => walk(child))
    }
    if (node.isBlock && node.type?.name !== 'doc') {
      parts.push('\n')
    }
  }

  walk(doc)
  return parts.join('').trim()
}

function setEditorText(text: string) {
  const view = editor.view
  if (!view)
    return

  const { state } = view
  const { schema } = state

  const paragraphType = schema.nodes.paragraph
  const docType = schema.nodes.doc
  if (!paragraphType || !docType)
    return

  // Build doc from text: split on newlines, create paragraphs
  const lines = text.split('\n')
  const blocks = lines.map((line) => {
    if (line) {
      return paragraphType.create(null, schema.text(line))
    }
    return paragraphType.create()
  })

  const doc = docType.create(null, blocks)
  const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content)
  view.dispatch(tr)
}

function focus() {
  editor.focus()
}

function blur() {
  editor.view?.dom?.blur()
}

function clear() {
  const view = editor.view
  if (!view)
    return
  const { state } = view
  const tr = state.tr.delete(0, state.doc.content.size)
  view.dispatch(tr)
}

function getText(): string {
  return extractPlainText(editor.view?.state?.doc)
}

function isEmpty(): boolean {
  return getText().length === 0
}

defineExpose({
  focus,
  blur,
  clear,
  getText,
  setText: setEditorText,
  isEmpty,
})
</script>

<template>
  <ProseKit :editor="editor">
    <div
      :ref="mountEditor"
      class="prompt-editor-content"
      :class="{ 'prompt-editor-disabled': disabled }"
    />
    <SlashMenu :workspace-root="workspaceRoot" />
    <PathMenu :workspace-root="workspaceRoot" />
  </ProseKit>
</template>

<style>
.prompt-editor-content {
  width: 100%;
  min-height: 80px;
  max-height: 240px;
  overflow-y: auto;
  padding: 1rem 1rem 0.5rem;
  background: transparent;
  font-size: 0.875rem;
  line-height: 1.625;
  color: hsl(var(--foreground));
  outline: none;
  cursor: text;
  white-space: pre-wrap;
}

.prompt-editor-content [contenteditable] {
  outline: none;
}

.prompt-editor-content p {
  margin: 0;
}

.prompt-editor-content .prosemirror-placeholder::before {
  color: hsl(var(--muted-foreground)) !important;
  font-style: normal !important;
}

.prompt-editor-content span[data-mention="slash-command"] {
  display: inline-block;
  margin: 0 0.25rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background-color: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-size: 0.8125rem;
  font-family: var(--font-sans);
  font-weight: 500;
  line-height: 1.5;
  vertical-align: baseline;
  user-select: all;
}

.prompt-editor-content span[data-mention="file-mention"],
.prompt-editor-content span[data-mention="dir-mention"] {
  display: inline-block;
  margin: 0 0.25rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  background-color: hsl(var(--accent) / 0.6);
  color: hsl(var(--accent-foreground));
  font-size: 0.8125rem;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-weight: 500;
  line-height: 1.5;
  vertical-align: baseline;
  user-select: all;
}

.prompt-editor-disabled {
  pointer-events: none;
  opacity: 0.5;
}
</style>
