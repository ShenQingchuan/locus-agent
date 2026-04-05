<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { useEditor, useEditorDerivedValue } from 'prosekit/vue'
import { computed, ref } from 'vue'
import { CODE_BLOCK_LANG_OPTIONS, getResolvedLang } from '@/utils/codeBlockDisplayName'

// Get editor from ProseKit context (parent must wrap this in <ProseKit>)
const editor = useEditor()

const langPopoverOpen = ref(false)
const langPopoverRef = ref<HTMLElement | null>(null)

function closeLangPopover() {
  langPopoverOpen.value = false
}
onClickOutside(langPopoverRef, closeLangPopover)

interface ActiveTarget {
  isActive?: (attrs?: Record<string, unknown>) => boolean
}

type CommandTarget = (attrs?: Record<string, unknown>) => void

interface EditorLike {
  marks: Record<string, ActiveTarget | undefined>
  nodes: Record<string, ActiveTarget | undefined>
  commands: Record<string, CommandTarget | undefined>
}

function toEditorLike(target: unknown): EditorLike {
  return target as EditorLike
}

function isActive(target: ActiveTarget | undefined, attrs?: Record<string, unknown>): boolean {
  return target?.isActive?.(attrs) ?? false
}

function runCommand(command: CommandTarget | undefined, attrs?: Record<string, unknown>) {
  command?.(attrs)
}

function getEditorApi(): EditorLike {
  return toEditorLike(editor.value)
}

interface EditorInstanceLike {
  view?: {
    state?: {
      selection?: {
        $from?: {
          parent?: {
            type?: { name?: string }
            attrs?: { language?: string }
          }
        }
      }
    }
  }
}

// Derive reactive state from editor updates
const editorState = useEditorDerivedValue((editorInstance) => {
  const api = toEditorLike(editorInstance)
  const codeBlockActive = isActive(api.nodes.codeBlock)
  let codeBlockLanguage = ''
  if (codeBlockActive) {
    const view = (editorInstance as EditorInstanceLike).view
    const parent = view?.state?.selection?.$from?.parent
    if (parent?.type?.name === 'codeBlock')
      codeBlockLanguage = parent.attrs?.language ?? ''
  }
  return {
    bold: isActive(api.marks.bold),
    italic: isActive(api.marks.italic),
    underline: isActive(api.marks.underline),
    strike: isActive(api.marks.strike),
    code: isActive(api.marks.code),
    heading1: isActive(api.nodes.heading, { level: 1 }),
    heading2: isActive(api.nodes.heading, { level: 2 }),
    heading3: isActive(api.nodes.heading, { level: 3 }),
    codeBlockActive,
    codeBlockLanguage,
  }
})

function setCodeBlockLanguage(langId: string) {
  runCommand(getEditorApi().commands.setCodeBlockAttrs, { language: langId })
  langPopoverOpen.value = false
}

interface ToolbarButton {
  key: string
  icon: string
  title: string
  action: () => void
  isActive?: boolean
}

const inlineButtons = computed<ToolbarButton[]>(() => [
  {
    key: 'bold',
    icon: 'i-carbon-text-bold',
    title: '加粗 (Ctrl+B)',
    action: () => runCommand(getEditorApi().commands.toggleBold),
    isActive: editorState.value?.bold,
  },
  {
    key: 'italic',
    icon: 'i-carbon-text-italic',
    title: '斜体 (Ctrl+I)',
    action: () => runCommand(getEditorApi().commands.toggleItalic),
    isActive: editorState.value?.italic,
  },
  {
    key: 'underline',
    icon: 'i-carbon-text-underline',
    title: '下划线 (Ctrl+U)',
    action: () => runCommand(getEditorApi().commands.toggleUnderline),
    isActive: editorState.value?.underline,
  },
  {
    key: 'strike',
    icon: 'i-carbon-text-strikethrough',
    title: '删除线',
    action: () => runCommand(getEditorApi().commands.toggleStrike),
    isActive: editorState.value?.strike,
  },
  {
    key: 'code',
    icon: 'i-carbon-code',
    title: '行内代码',
    action: () => runCommand(getEditorApi().commands.toggleCode),
    isActive: editorState.value?.code,
  },
])

const blockButtons = computed<ToolbarButton[]>(() => [
  {
    key: 'bulletList',
    icon: 'i-carbon-list-bulleted',
    title: '无序列表',
    action: () => runCommand(getEditorApi().commands.toggleList, { kind: 'bullet' }),
  },
  {
    key: 'orderedList',
    icon: 'i-carbon-list-numbered',
    title: '有序列表',
    action: () => runCommand(getEditorApi().commands.toggleList, { kind: 'ordered' }),
  },
  {
    key: 'blockquote',
    icon: 'i-carbon-quotes',
    title: '引用',
    action: () => runCommand(getEditorApi().commands.toggleBlockquote),
  },
  {
    key: 'codeBlock',
    icon: 'i-tabler:code',
    title: '代码块',
    action: () => runCommand(getEditorApi().commands.toggleCodeBlock),
  },
  {
    key: 'horizontalRule',
    icon: 'i-carbon-subtract',
    title: '水平线',
    action: () => runCommand(getEditorApi().commands.insertHorizontalRule),
  },
])

const historyButtons = computed<ToolbarButton[]>(() => [
  {
    key: 'undo',
    icon: 'i-carbon-undo',
    title: '撤销 (Ctrl+Z)',
    action: () => runCommand(getEditorApi().commands.undo),
  },
  {
    key: 'redo',
    icon: 'i-carbon-redo',
    title: '重做 (Ctrl+Shift+Z)',
    action: () => runCommand(getEditorApi().commands.redo),
  },
])
</script>

<template>
  <div class="flex-shrink-0 border-b border-border px-3 py-1.5 flex items-center gap-0.5 flex-wrap bg-background/80">
    <!-- Inline marks -->
    <button
      v-for="btn in inlineButtons"
      :key="btn.key"
      class="p-1.5 rounded-md text-muted-foreground transition-colors duration-100"
      :class="btn.isActive
        ? 'bg-accent text-accent-foreground'
        : 'hover:bg-accent/50 hover:text-foreground'"
      :title="btn.title"
      @mousedown.prevent="btn.action()"
    >
      <div :class="btn.icon" class="h-4 w-4" />
    </button>

    <!-- Separator -->
    <div class="w-px h-5 bg-border mx-1" />

    <!-- Block elements -->
    <button
      v-for="btn in blockButtons"
      :key="btn.key"
      class="p-1.5 rounded-md text-muted-foreground transition-colors duration-100"
      :class="[btn.isActive
                 ? 'bg-accent text-accent-foreground'
                 : 'hover:bg-accent/50 hover:text-foreground',
               btn.key === 'codeBlock' && editorState?.codeBlockActive ? 'relative' : '']"
      :title="btn.title"
      @mousedown.prevent="btn.key === 'codeBlock' && editorState?.codeBlockActive
        ? (langPopoverOpen = !langPopoverOpen)
        : btn.action()"
    >
      <div :class="btn.icon" class="h-4 w-4" />
      <div
        v-if="btn.key === 'codeBlock' && editorState?.codeBlockActive"
        ref="langPopoverRef"
        class="absolute left-0 top-full mt-1 z-50 min-w-36 rounded-lg border border-border bg-popover shadow-lg py-1 max-h-56 overflow-y-auto"
        :class="langPopoverOpen ? 'block' : 'hidden'"
      >
        <div class="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          切换语言
        </div>
        <button
          v-for="opt in CODE_BLOCK_LANG_OPTIONS"
          :key="opt.id"
          class="w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors flex justify-between"
          :class="getResolvedLang(editorState?.codeBlockLanguage || 'text') === opt.id ? 'bg-accent/30 font-medium' : ''"
          @mousedown.prevent="setCodeBlockLanguage(opt.id)"
        >
          <span>{{ opt.name }}</span>
          <span v-if="getResolvedLang(editorState?.codeBlockLanguage || 'text') === opt.id" class="i-carbon-checkmark h-3 w-3 text-primary" />
        </button>
      </div>
    </button>

    <!-- Separator -->
    <div class="w-px h-5 bg-border mx-1" />

    <!-- History -->
    <button
      v-for="btn in historyButtons"
      :key="btn.key"
      class="p-1.5 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors duration-100"
      :title="btn.title"
      @mousedown.prevent="btn.action()"
    >
      <div :class="btn.icon" class="h-4 w-4" />
    </button>
  </div>
</template>
