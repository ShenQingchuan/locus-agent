<script setup lang="ts">
import { computed, nextTick, ref, watch, watchEffect } from 'vue'
import { getShikiHighlighter } from '@/utils/shiki'

const props = withDefaults(defineProps<{
  code: string
  lang?: string
}>(), {
  lang: 'json',
})

const html = ref('')
const codeBlockRef = ref<HTMLElement | null>(null)

const highlighter = getShikiHighlighter()

watchEffect(async () => {
  // 在 await 之前读取响应式依赖，确保数据更新时能重新触发
  const code = props.code
  let lang = props.lang

  const hl = await highlighter
  if (!hl.getLoadedLanguages().includes(lang)) {
    try {
      await hl.loadLanguage(lang as any)
    }
    catch {
      lang = 'text'
    }
  }

  html.value = hl.codeToHtml(code, {
    lang,
    themes: {
      dark: 'github-dark',
      light: 'github-light',
    },
  })
})

const styledHtml = computed(() => html.value)

watch(() => props.code, async () => {
  await nextTick()
  const preElement = codeBlockRef.value?.querySelector('pre.shiki') as HTMLElement
  if (preElement) {
    preElement.scrollTop = preElement.scrollHeight
  }
}, { flush: 'post' })
</script>

<template>
  <div ref="codeBlockRef" class="shiki-code" v-html="styledHtml" />
</template>

<style>
.shiki-code pre.shiki {
  margin: 0;
  padding: 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-y: auto;
  max-height: 10rem;
  border-radius: 0;
}

.shiki-code pre.shiki code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}

/* class-based dark mode: override shiki default media query */
html.dark .shiki,
html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
  font-style: var(--shiki-dark-font-style) !important;
  font-weight: var(--shiki-dark-font-weight) !important;
  text-decoration: var(--shiki-dark-text-decoration) !important;
}
</style>
