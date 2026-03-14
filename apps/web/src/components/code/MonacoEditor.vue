<script setup lang="ts">
import type { editor as MonacoEditor } from 'modern-monaco/editor-core'
import { useDark } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  language?: string
  readOnly?: boolean
  options?: MonacoEditor.IStandaloneEditorConstructionOptions
}>(), {
  modelValue: '',
  language: 'json',
  readOnly: false,
  options: () => ({}),
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
const THEME_DARK = 'github-dark-default'
const THEME_LIGHT = 'min-light'

const containerRef = ref<HTMLDivElement>()
const editorRef = shallowRef<MonacoEditor.IStandaloneCodeEditor>()
const monacoRef = shallowRef<{ editor: { setTheme: (theme: string) => void } } | undefined>()
const isDark = useDark()
const isLoading = ref(true)

let suppressExternalSync = false

onMounted(async () => {
  const { init } = await import('modern-monaco')
  isLoading.value = true

  const currentTheme = isDark.value ? THEME_DARK : THEME_LIGHT
  const monaco = await init({
    defaultTheme: currentTheme,
    themes: [THEME_DARK, THEME_LIGHT],
    langs: [props.language],
  })
  monacoRef.value = monaco

  const editor = monaco.editor.create(containerRef.value!, {
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: 'off',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    folding: false,
    wordWrap: 'on',
    tabSize: 2,
    renderLineHighlight: 'none',
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'hidden',
      verticalScrollbarSize: 6,
    },
    padding: { top: 8, bottom: 8 },
    readOnly: props.readOnly,
    ...props.options,
  })

  // modern-monaco init() is a singleton — defaultTheme only applies on first call.
  // Explicitly set the correct theme after each editor creation.
  monaco.editor.setTheme(currentTheme)

  const model = monaco.editor.createModel(props.modelValue, props.language)
  editor.setModel(model)

  editor.onDidChangeModelContent(() => {
    const value = editor.getValue()
    suppressExternalSync = true
    emit('update:modelValue', value)
    queueMicrotask(() => {
      suppressExternalSync = false
    })
  })

  editorRef.value = editor
  isLoading.value = false
})

watch(() => props.modelValue, (newVal) => {
  if (suppressExternalSync)
    return
  const editor = editorRef.value
  if (editor && editor.getValue() !== newVal)
    editor.setValue(newVal)
})

watch(isDark, (dark) => {
  monacoRef.value?.editor.setTheme(dark ? THEME_DARK : THEME_LIGHT)
})

onBeforeUnmount(() => {
  editorRef.value?.dispose()
})
</script>

<template>
  <div class="monaco-editor-wrapper">
    <div
      v-if="isLoading"
      class="monaco-editor-loading"
    >
      <div class="loading-spinner" />
    </div>
    <div
      ref="containerRef"
      class="monaco-editor-container"
      :class="{ 'opacity-0': isLoading }"
    />
  </div>
</template>

<style scoped>
.monaco-editor-wrapper {
  position: relative;
  width: 100%;
  min-height: 280px;
}

.monaco-editor-container {
  width: 100%;
  min-height: 280px;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  overflow: hidden;
  transition: opacity 0.2s ease;
}

.monaco-editor-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--background) / 0.8);
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  z-index: 10;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid hsl(var(--border));
  border-top-color: hsl(var(--primary));
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
