<script setup lang="ts">
import type { EditorState, NoteEditorChange } from '@univedge/locus-agent-sdk'
import { ProseKit } from 'prosekit/vue'
import { useNoteEditor } from '@/composables/useNoteEditor'
import NoteToolbar from './NoteToolbar.vue'

import 'prosekit/basic/style.css'
import 'prosekit/extensions/placeholder/style.css'

const props = defineProps<{
  /** ProseKit JSON document state (from DB) */
  editorState?: EditorState
  /** Plain text content (fallback when no editorState) */
  content?: string
}>()
const emit = defineEmits<{
  change: [data: NoteEditorChange]
}>()

const { editor, mountEditor } = useNoteEditor(props, emit)
</script>

<template>
  <ProseKit :editor="editor">
    <NoteToolbar />

    <!-- Editor content area -->
    <div
      :ref="mountEditor"
      class="note-editor-content pt-4 px-6 pb-30 focus:outline-none max-w-none"
    />
  </ProseKit>
</template>

<style>
/* ==================== Base ====================  */

.note-editor-content {
  cursor: text;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
}

.note-editor-content [contenteditable] {
  outline: none;
}

/* ==================== Paragraph ====================  */

.note-editor-content p {
  margin: 0.25em 0;
}

.note-editor-content p:first-child {
  margin-top: 0;
}

/* ==================== Headings ====================  */

.note-editor-content h1,
.note-editor-content h2,
.note-editor-content h3,
.note-editor-content h4,
.note-editor-content h5,
.note-editor-content h6 {
  color: hsl(var(--foreground));
  line-height: 1.35;
  margin-bottom: 0.25em;
}

.note-editor-content h1 {
  font-size: 1.625rem;
  font-weight: 700;
  margin-top: 2em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}

.note-editor-content h2 {
  font-size: 1.3rem;
  font-weight: 650;
  margin-top: 1.6em;
  padding-bottom: 0.2em;
  border-bottom: 1px solid hsl(var(--border) / 0.3);
}

.note-editor-content h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 1.4em;
}

.note-editor-content h4 {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 1.2em;
}

/* First heading in doc needs no top margin */
.note-editor-content > h1:first-child,
.note-editor-content > h2:first-child,
.note-editor-content > h3:first-child,
.note-editor-content > h4:first-child {
  margin-top: 0;
}

/* ==================== Inline marks ====================  */

.note-editor-content strong {
  font-weight: 650;
  color: hsl(var(--foreground));
}

.note-editor-content em {
  font-style: italic;
}

.note-editor-content u {
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

.note-editor-content s {
  text-decoration: line-through;
  opacity: 0.65;
}

/* ==================== Inline code ====================  */

.note-editor-content code:not(pre code) {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.85em;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border) / 0.5);
  padding: 0.15em 0.4em;
  border-radius: 0.3rem;
  color: hsl(var(--foreground));
  word-break: break-word;
}

/* ==================== Code block (Shiki) ====================  */

.note-editor-content pre {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  margin: 1em 0;
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  border: 1px solid hsl(var(--border) / 0.4);
  /* Use Shiki CSS variables with fallback */
  background: var(--prosemirror-highlight-bg, hsl(var(--muted))) !important;
  color: var(--prosemirror-highlight, hsl(var(--foreground)));
  tab-size: 2;
}

.note-editor-content pre code {
  font-family: inherit;
  font-size: inherit;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
  color: inherit;
}

html.dark .note-editor-content pre {
  background: var(--shiki-dark-bg, var(--prosemirror-highlight-bg, hsl(var(--muted)))) !important;
  color: var(--shiki-dark, var(--prosemirror-highlight, hsl(var(--foreground))));
}

html.dark .note-editor-content pre span.shiki[style] {
  color: var(--shiki-dark, inherit) !important;
  font-style: var(--shiki-dark-font-style, inherit) !important;
  font-weight: var(--shiki-dark-font-weight, inherit) !important;
  text-decoration: var(--shiki-dark-text-decoration, inherit) !important;
}

/* Language label on code block */
.note-editor-content pre[data-language]::before {
  content: attr(data-language);
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--prosemirror-highlight, hsl(var(--muted-foreground)));
  opacity: 0.6;
  margin-bottom: 0.5rem;
  user-select: none;
}

html.dark .note-editor-content pre[data-language]::before {
  color: var(--shiki-dark, var(--prosemirror-highlight, hsl(var(--muted-foreground))));
  opacity: 0.75;
}

/* Hide empty language label */
.note-editor-content pre[data-language=""]::before {
  display: none;
}

/* ==================== Blockquote ====================  */

.note-editor-content blockquote {
  margin: 0.75em 0;
  padding: 0.25em 0 0.25em 1.25em;
  border-left: 3px solid hsl(var(--primary) / 0.4);
  color: hsl(var(--muted-foreground));
}

.note-editor-content blockquote p {
  margin: 0.15em 0;
}

/* Nested blockquotes */
.note-editor-content blockquote blockquote {
  margin-left: 0;
  border-left-color: hsl(var(--border));
}

/* ==================== Lists ====================  */

.note-editor-content ul,
.note-editor-content ol {
  margin: 0.5em 0;
  padding-left: 1.75em;
}

.note-editor-content ul {
  list-style-type: disc;
}

.note-editor-content ul ul {
  list-style-type: circle;
}

.note-editor-content ul ul ul {
  list-style-type: square;
}

.note-editor-content ol {
  list-style-type: decimal;
}

.note-editor-content li {
  margin: 0.15em 0;
}

.note-editor-content li > p {
  margin: 0;
}

/* Nested list spacing */
.note-editor-content li > ul,
.note-editor-content li > ol {
  margin: 0.1em 0;
}

/* ==================== Links ====================  */

.note-editor-content a {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  text-decoration-color: hsl(var(--primary) / 0.4);
  transition: text-decoration-color 0.15s ease;
}

.note-editor-content a:hover {
  text-decoration-color: hsl(var(--primary));
}

/* ==================== Horizontal rule ====================  */

.note-editor-content hr {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 1.75em 0;
}

/* ==================== Table ====================  */

.note-editor-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.875rem;
}

.note-editor-content th,
.note-editor-content td {
  border: 1px solid hsl(var(--border));
  padding: 0.5em 0.75em;
  text-align: left;
}

.note-editor-content th {
  background: hsl(var(--muted));
  font-weight: 600;
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
  color: hsl(var(--muted-foreground));
}

/* ==================== Image ====================  */

.note-editor-content img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1em 0;
}

/* ==================== Placeholder ====================  */

.note-editor-content .prosemirror-placeholder::before {
  color: hsl(var(--muted-foreground) / 0.5) !important;
  font-style: normal !important;
}

/* ==================== Selection ====================  */

.note-editor-content ::selection {
  background: hsl(var(--primary) / 0.2);
}
</style>
