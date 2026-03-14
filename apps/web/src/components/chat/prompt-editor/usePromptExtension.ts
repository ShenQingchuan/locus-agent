import type { Extension } from 'prosekit/core'
import { defineBaseCommands, defineBaseKeymap, defineHistory, defineKeymap, defineNodeSpec, definePlugin, Priority, union, withPriority } from 'prosekit/core'
import { defineMention } from 'prosekit/extensions/mention'
import { definePlaceholder } from 'prosekit/extensions/placeholder'
import { Plugin } from 'prosekit/pm/state'

export interface PromptExtensionOptions {
  placeholder?: string
  onSubmit?: () => boolean
  onEscape?: () => boolean
  onShiftTab?: () => boolean
}

function defineDoc() {
  return defineNodeSpec({
    name: 'doc',
    content: 'block+',
    topNode: true,
  })
}

function defineText() {
  return defineNodeSpec({
    name: 'text',
    group: 'inline',
  })
}

function defineParagraph() {
  return defineNodeSpec({
    name: 'paragraph',
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return ['p', 0]
    },
  })
}

function defineHardBreak() {
  return defineNodeSpec({
    name: 'hardBreak',
    group: 'inline',
    inline: true,
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br']
    },
  })
}

/**
 * Ensures a mention atom node is never the last inline child of a textblock.
 * Contenteditable cannot render a cursor after a trailing inline-block atom,
 * so we always guarantee a trailing space exists after it.
 */
function defineMentionGuard() {
  return definePlugin(
    new Plugin({
      appendTransaction(_transactions, _oldState, newState) {
        const fixes: number[] = []

        newState.doc.descendants((node, pos) => {
          if (!node.isTextblock)
            return true
          if (node.lastChild?.type.name === 'mention') {
            // Insert position = end of textblock content
            fixes.push(pos + 1 + node.content.size)
          }
          return false
        })

        if (fixes.length === 0)
          return null

        const tr = newState.tr
        for (let i = fixes.length - 1; i >= 0; i--)
          tr.insertText(' ', fixes[i])
        return tr
      },
    }),
  )
}

/**
 * Clipboard: serialize file/dir mentions with full path (id) for copy,
 * while the editor displays basename (value) in the tag.
 */
function defineMentionClipboard() {
  return definePlugin(() => {
    return new Plugin({
      props: {
        clipboardTextSerializer(slice, _view) {
          const { content } = slice
          return content.textBetween(0, content.size, '\n\n', (node) => {
            if (node.type.name === 'mention') {
              const kind = node.attrs?.kind as string | undefined
              const id = node.attrs?.id as string | undefined
              if ((kind === 'file-mention' || kind === 'dir-mention') && id)
                return kind === 'dir-mention' ? `@${id}/` : `@${id}`
              return (node.attrs?.value as string) ?? ''
            }
            const leafText = node.type.spec?.leafText
            return typeof leafText === 'function' ? leafText(node) : ''
          })
        },
      },
    })
  })
}

/**
 * When backspacing into a mention, delete the mention (and its guard space)
 * in one step so the guard plugin doesn't re-insert the space endlessly.
 */
function defineMentionDeleteKeymap() {
  return withPriority(
    defineKeymap({
      Backspace: (state, dispatch) => {
        const { selection } = state
        if (!selection.empty)
          return false

        const $pos = selection.$from
        const before = $pos.nodeBefore

        if (!before)
          return false

        if (before.type.name === 'mention') {
          if (dispatch)
            dispatch(state.tr.delete($pos.pos - before.nodeSize, $pos.pos))
          return true
        }

        if (before.isText && before.text === ' ') {
          const posBeforeSpace = $pos.pos - before.nodeSize
          const $bs = state.doc.resolve(posBeforeSpace)
          if ($bs.nodeBefore?.type.name === 'mention') {
            const mention = $bs.nodeBefore
            if (dispatch)
              dispatch(state.tr.delete(posBeforeSpace - mention.nodeSize, $pos.pos))
            return true
          }
        }

        return false
      },
    }),
    Priority.high,
  )
}

export function definePromptExtension(options: PromptExtensionOptions = {}): Extension {
  const submitKeymap = withPriority(
    defineKeymap({
      Enter: () => {
        return options.onSubmit?.() ?? false
      },
    }),
    Priority.high,
  )

  const hardBreakKeymap = defineKeymap({
    'Shift-Enter': (state, dispatch) => {
      const { hardBreak } = state.schema.nodes
      if (!hardBreak)
        return false
      if (dispatch)
        dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
      return true
    },
  })

  const escapeKeymap = defineKeymap({
    Escape: () => {
      return options.onEscape?.() ?? false
    },
  })

  const shiftTabKeymap = defineKeymap({
    'Shift-Tab': () => {
      return options.onShiftTab?.() ?? false
    },
  })

  return union(
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHardBreak(),
    defineMention(),
    defineMentionGuard(),
    defineMentionClipboard(),
    defineMentionDeleteKeymap(),
    defineBaseKeymap(),
    defineBaseCommands(),
    defineHistory(),
    definePlaceholder({ placeholder: options.placeholder ?? '' }),
    submitKeymap,
    hardBreakKeymap,
    escapeKeymap,
    shiftTabKeymap,
  )
}
