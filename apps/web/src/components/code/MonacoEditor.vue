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

let suppressExternalSync = false

onMounted(async () => {
  const { init } = await import('modern-monaco')

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
  <div
    ref="containerRef"
    class="monaco-editor-container"
  />
</template>

<style scoped>
.monaco-editor-container {
  width: 100%;
  min-height: 280px;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  overflow: hidden;
}
</style>
