import type { EditorState, NoteEditorChange } from '@univedge/locus-agent-sdk'
import type { NodeJSON } from 'prosekit/core'
import type { HighlightParser } from 'prosekit/extensions/code-block'
import type { ComponentPublicInstance, EmitFn } from 'vue'
import { defineBasicExtension } from 'prosekit/basic'
import { createEditor, defineKeymap, defineNodeSpec, definePlugin, isInCodeBlock, Priority, union, unsetBlockType, withPriority } from 'prosekit/core'
import { defineCodeBlockHighlight } from 'prosekit/extensions/code-block'
import { definePlaceholder } from 'prosekit/extensions/placeholder'
import { Plugin as PmPlugin } from 'prosekit/pm/state'
import { useDocChange } from 'prosekit/vue'
import { createParser as createShikiParser } from 'prosemirror-highlight/shiki'
import { bundledLanguagesInfo } from 'shiki'
import { markRaw } from 'vue'
import { getCodeBlockDisplayName } from '@/utils/codeBlockDisplayName'
import { nodeToMarkdown } from '@/utils/docToMarkdown'
import { getShikiHighlighter } from '@/utils/shiki'

const RE_LANGUAGE_CLASS = /language-(\S+)/
const RE_NEWLINE = /\n/g
const RE_AMPERSAND = /&/g
const RE_LESS_THAN = /</g
const RE_GREATER_THAN = />/g

export interface UseNoteEditorProps {
  editorState?: EditorState
  content?: string
}

export interface NoteEditorEmits {
  change: [data: NoteEditorChange]
}

export function useNoteEditor(
  props: UseNoteEditorProps,
  emit: EmitFn<NoteEditorEmits>,
) {
// ==================== Editor Setup ====================

  const languageAliasMap = new Map<string, string>([
    ['txt', 'text'],
    ['plaintext', 'text'],
    ['plain_text', 'text'],
  ])

  for (const info of bundledLanguagesInfo) {
    languageAliasMap.set(info.id.toLowerCase(), info.id)
    for (const alias of info.aliases ?? []) {
      languageAliasMap.set(alias.toLowerCase(), info.id)
    }
  }

  function normalizeCodeBlockLanguage(input: string): string {
    const key = input.trim().toLowerCase()
    return languageAliasMap.get(key) ?? (key || 'text')
  }

  function createDualThemeCodeBlockParser(): HighlightParser {
    const unsupportedLanguages = new Set<string>()
    const loadingLanguages = new Map<string, Promise<void>>()
    const knownLoadedLanguages = new Set<string>(['text'])
    let parser: HighlightParser | undefined
    let highlighter: Awaited<ReturnType<typeof getShikiHighlighter>> | undefined

    const ensureHighlighter = getShikiHighlighter().then((instance) => {
      highlighter = instance
      for (const lang of highlighter.getLoadedLanguages()) {
        knownLoadedLanguages.add(String(lang))
      }
    })

    return (options: Parameters<HighlightParser>[0]) => {
      if (!highlighter) {
        return ensureHighlighter
      }

      if (!parser) {
        parser = createShikiParser(highlighter, {
          themes: {
            light: 'github-light',
            dark: 'github-dark',
          },
        }) as HighlightParser
      }

      const language = normalizeCodeBlockLanguage(options.language || 'text')
      if (!unsupportedLanguages.has(language) && !knownLoadedLanguages.has(language) && highlighter.getLoadedLanguages().includes(language as any)) {
        knownLoadedLanguages.add(language)
      }

      if (language !== 'text' && !unsupportedLanguages.has(language) && !knownLoadedLanguages.has(language)) {
        const inFlight = loadingLanguages.get(language)
        if (inFlight) {
          return inFlight
        }

        const task = highlighter.loadLanguage(language as any).then(
          () => {
            knownLoadedLanguages.add(language)
          },
          () => {
            unsupportedLanguages.add(language)
          },
        ).finally(() => {
          loadingLanguages.delete(language)
        })

        loadingLanguages.set(language, task)
        return task
      }

      return parser({
        ...options,
        language: unsupportedLanguages.has(language) ? 'text' : language,
      })
    }
  }

  function defineCodeBlockSpecWithDisplayName() {
    return defineNodeSpec({
      name: 'codeBlock',
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
      attrs: {
        language: { default: '', validate: 'string' },
      },
      parseDOM: [{
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => {
          const el = node as HTMLElement
          const code = el.querySelector('code')
          const raw = el.getAttribute('data-language') ?? code?.className?.match(RE_LANGUAGE_CLASS)?.[1] ?? ''
          return { language: normalizeCodeBlockLanguage(raw) }
        },
      }],
      toDOM(node) {
        const { language } = node.attrs
        return [
          'pre',
          { 'data-language': getCodeBlockDisplayName(language) || undefined },
          ['code', { class: language ? `language-${language}` : undefined }, 0],
        ]
      },
    })
  }

  function defineCodeBlockEditingKeymap() {
    return withPriority(defineKeymap({
      Tab: (state, dispatch) => {
        if (!isInCodeBlock(state.selection)) {
          return false
        }

        if (dispatch) {
          const { from, to } = state.selection
          dispatch(state.tr.insertText('  ', from, to))
        }
        return true
      },

      Backspace: (state, dispatch) => {
        const { selection } = state
        if (!selection.empty || !isInCodeBlock(selection)) {
          return false
        }

        const { $from, from } = selection
        const isCodeBlock = $from.parent.type.name === 'codeBlock'
        const isEmptyCodeBlock = $from.parent.content.size === 0
        const isAtBlockStart = $from.parentOffset === 0
        const isFirstBlock = from === 1

        if (!isCodeBlock || !isEmptyCodeBlock || !isAtBlockStart || !isFirstBlock) {
          return false
        }

        return unsetBlockType()(state, dispatch)
      },
    }), Priority.high)
  }

  function defineMarkdownClipboardText() {
    return definePlugin(({ schema }) => {
      return new PmPlugin({
        props: {
          clipboardTextSerializer(slice) {
            const tempDoc = schema.topNodeType.create(null, slice.content)
            return nodeToMarkdown(tempDoc)
          },
        },
      })
    })
  }

  function buildExtension() {
    return union(
      defineBasicExtension(),
      defineCodeBlockSpecWithDisplayName(),
      defineCodeBlockEditingKeymap(),
      defineMarkdownClipboardText(),
      definePlaceholder({ placeholder: '开始记录 ...' }),
      defineCodeBlockHighlight({
        parser: createDualThemeCodeBlockParser(),
      }),
    )
  }

  function isNodeJSON(value: unknown): value is NodeJSON {
    return !!value
      && typeof value === 'object'
      && 'type' in (value as Record<string, unknown>)
      && typeof (value as { type?: unknown }).type === 'string'
  }

  function getDefaultContent(): NodeJSON | string | undefined {
  // Prefer saved editor state
    if (isNodeJSON(props.editorState)) {
      return props.editorState
    }
    // Fall back to plain text → HTML
    if (props.content) {
      const html = props.content
        .split('\n\n')
        .map(p => `<p>${escapeHtml(p).replace(RE_NEWLINE, '<br>')}</p>`)
        .join('')
      return html || undefined
    }
    return undefined
  }

  const editor = markRaw(createEditor({
    extension: buildExtension(),
    defaultContent: getDefaultContent(),
  }))

  function mountEditor(
    ref: Element | ComponentPublicInstance | null,
  ): void {
    const place = ref && '$el' in ref ? (ref as ComponentPublicInstance).$el as Element | null : ref
    editor.mount(place as HTMLElement | null | undefined)
  }

  // ==================== Doc Change Handler ====================
  // NOTE: useDocChange must be called inside <script setup> of a component
  // that is wrapped in <ProseKit>. Since NoteEditor itself wraps <ProseKit>,
  // we pass { editor } explicitly.

  useDocChange((doc) => {
    const json = editor.getDocJSON()
    const text = extractPlainText(doc)
    emit('change', {
      editorState: json as unknown as Record<string, unknown>,
      content: text,
    })
  }, { editor })

  // ==================== Helpers ====================

  function escapeHtml(text: string): string {
    return text
      .replace(RE_AMPERSAND, '&amp;')
      .replace(RE_LESS_THAN, '&lt;')
      .replace(RE_GREATER_THAN, '&gt;')
  }

  /**
   * Extract plain text from a ProseMirror document node.
   * Used for search indexing and AI context.
   */
  function extractPlainText(doc: any): string {
    if (!doc)
      return ''

    const parts: string[] = []

    function walk(node: any) {
      if (node.isText) {
        parts.push(node.text || '')
        return
      }
      if (node.content) {
        node.content.forEach((child: any) => walk(child))
      }
      // Add newline after block nodes
      if (node.isBlock && node.type?.name !== 'doc') {
        parts.push('\n')
      }
    }

    walk(doc)
    return parts.join('').trim()
  }

  return {
    editor,
    mountEditor,
  }
}
