<script setup lang="ts">
import type { BundledLanguage } from 'shiki'
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { getCodeBlockDisplayName, getResolvedLang } from '@/utils/codeBlockDisplayName'
import { getShikiHighlighter } from '@/utils/shiki'
import DiffViewer from './DiffViewer.vue'

const props = defineProps<{
  node: {
    type: 'code_block'
    language: string
    code: string
    raw: string
  }
}>()

/** Whether this code block contains a unified diff */
const isDiff = computed(() => {
  const lang = props.node.language?.toLowerCase()
  return lang === 'diff' || lang === 'patch'
})

const html = ref('')
const codeBlockRef = ref<HTMLElement | null>(null)

const highlighter = getShikiHighlighter()

const resolvedLang = computed(() => getResolvedLang(props.node.language || 'text'))
const displayLang = computed(() => getCodeBlockDisplayName(props.node.language || 'text'))

watchEffect(async () => {
  // 在 await 之前读取响应式依赖，确保流式更新时能重新触发
  const code = props.node.code || ''
  const targetLang = resolvedLang.value

  const hl = await highlighter
  let lang = targetLang
  if (!hl.getLoadedLanguages().includes(lang)) {
    try {
      await hl.loadLanguage(lang as BundledLanguage)
    }
    catch {
      lang = 'text'
    }
  }

  html.value = hl.codeToHtml(code, {
    lang,
    themes: {
      dark: 'github-dark-default',
      light: 'min-light',
    },
  })
})

watch(() => props.node.code, async () => {
  await nextTick()
  const preElement = codeBlockRef.value?.querySelector('pre.shiki') as HTMLElement
  if (preElement) {
    preElement.scrollTop = preElement.scrollHeight
  }
}, { flush: 'post' })

const copied = ref(false)
async function handleCopy() {
  try {
    await navigator.clipboard.writeText(props.node.code || '')
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
  catch {}
}
</script>

<template>
  <!-- Diff rendering via @pierre/diffs -->
  <div v-if="isDiff" class="code-block-wrapper relative group my-3 overflow-hidden">
    <DiffViewer :patch="node.code" />
  </div>

  <!-- Normal code block -->
  <div v-else class="code-block-wrapper relative group my-3 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-1.5 bg-muted/50 text-xs text-muted-foreground">
      <span class="font-mono">{{ displayLang }}</span>
      <button
        class="transition-opacity duration-150 p-1 rounded hover:bg-muted"
        title="复制"
        @click="handleCopy"
      >
        <div v-if="copied" class="i-carbon-checkmark h-3.5 w-3.5 text-green-500" />
        <div v-else class="i-carbon-copy h-3.5 w-3.5" />
      </button>
    </div>
    <!-- Code -->
    <div ref="codeBlockRef" class="code-block-content" v-html="html" />
  </div>
</template>

<style>
.code-block-content pre.shiki {
  margin: 0;
  padding: 0.75rem 1rem;
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  max-height: 30rem;
  border-radius: 0;
}

.code-block-content pre.shiki code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}

/* class-based dark mode */
html.dark .code-block-content .shiki,
html.dark .code-block-content .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}
</style>
