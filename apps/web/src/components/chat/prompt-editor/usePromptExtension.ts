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
