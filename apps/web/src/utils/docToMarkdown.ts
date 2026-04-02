import type { MarkdownSerializerState } from 'prosemirror-markdown'
import type { Mark, Node } from 'prosemirror-model'
import { MarkdownSerializer } from 'prosemirror-markdown'

/**
 * Internal properties of MarkdownSerializerState that are used at runtime
 * but not exposed in the public type declarations.
 */
interface SerializerStateInternal extends MarkdownSerializerState {
  flushClose: (size: number) => void
  inAutolink?: boolean
}

const RE_TRIPLE_BACKTICKS = /`{3,}/g
const RE_PARENS = /[()]/g
const RE_DOUBLE_QUOTE = /"/g
const RE_LINK_SPECIAL = /[()"/]/g
const RE_BACKTICK_RUN = /`+/g
const RE_PROTOCOL_PREFIX = /^\w+:/

/**
 * ProseKit (camelCase) 节点和 mark 名称到 Markdown 的序列化器。
 *
 * 基于 prosemirror-markdown 的 defaultMarkdownSerializer，
 * 将 key 改为 ProseKit basic extension 使用的 camelCase 命名。
 */
const serializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    codeBlock(state, node) {
      const backticks = node.textContent.match(RE_TRIPLE_BACKTICKS)
      const fence = backticks ? `${backticks.sort().slice(-1)[0]}\`` : '```'
      state.write(`${fence}${node.attrs.language || ''}\n`)
      state.text(node.textContent, false)
      state.write('\n')
      state.write(fence)
      state.closeBlock(node)
    },
    heading(state, node) {
      state.write(`${'#'.repeat(node.attrs.level)} `)
      state.renderInline(node, false)
      state.closeBlock(node)
    },
    horizontalRule(state, node) {
      state.write(node.attrs.markup || '---')
      state.closeBlock(node)
    },
    list(state, node, parent, index) {
      // prosemirror-flat-list: single "list" node with attrs.kind
      if (index > 0 && parent.child(index - 1).type.name === 'list')
        (state as SerializerStateInternal).flushClose(1)

      const kind = node.attrs.kind as string
      let marker: string

      if (kind === 'ordered') {
        marker = `${computeOrderedNumber(parent, index)}. `
      }
      else if (kind === 'task') {
        marker = node.attrs.checked ? '- [x] ' : '- [ ] '
      }
      else {
        marker = '- '
      }

      state.wrapBlock(' '.repeat(marker.length), marker, node, () => {
        state.renderContent(node)
      })
    },
    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    image(state, node) {
      state.write(
        `![${state.esc(node.attrs.alt || '')}](${
          node.attrs.src.replace(RE_PARENS, '\\$&')
        }${node.attrs.title ? ` "${node.attrs.title.replace(RE_DOUBLE_QUOTE, '\\"')}"` : ''})`,
      )
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },
    text(state, node) {
      state.text(node.text!, !(state as SerializerStateInternal).inAutolink)
    },
  },
  {
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    underline: { open: '<u>', close: '</u>' },
    strike: { open: '~~', close: '~~' },
    code: {
      open(_state, _mark, parent, index) { return backticksFor(parent.child(index), -1) },
      close(_state, _mark, parent, index) { return backticksFor(parent.child(index - 1), 1) },
      escape: false,
    },
    link: {
      open(state, mark, parent, index) {
        const s = state as SerializerStateInternal
        s.inAutolink = isPlainURL(mark, parent, index)
        return s.inAutolink ? '<' : '['
      },
      close(state, mark) {
        const s = state as SerializerStateInternal
        const { inAutolink } = s
        s.inAutolink = undefined
        if (inAutolink)
          return '>'
        return `](${mark.attrs.href.replace(RE_LINK_SPECIAL, '\\$&')}${
          mark.attrs.title ? ` "${mark.attrs.title.replace(RE_DOUBLE_QUOTE, '\\"')}"` : ''
        })`
      },
      mixable: true,
    },
  },
  { strict: false },
)

/**
 * Compute the display number for an ordered list item in a flat-list structure.
 * Scans backwards to find the start of the consecutive ordered run.
 */
function computeOrderedNumber(parent: Node, index: number): number {
  if (parent.child(index).attrs.order != null)
    return parent.child(index).attrs.order as number

  let num = 1
  for (let i = index - 1; i >= 0; i--) {
    const sib = parent.child(i)
    if (sib.type.name !== 'list' || sib.attrs.kind !== 'ordered')
      break
    if (sib.attrs.order != null)
      return (sib.attrs.order as number) + (index - i)
    num++
  }
  return num
}

function backticksFor(node: Node, side: number) {
  let m: RegExpExecArray | null
  let len = 0
  if (node.isText) {
    RE_BACKTICK_RUN.lastIndex = 0
    // eslint-disable-next-line no-cond-assign
    while (m = RE_BACKTICK_RUN.exec(node.text!))
      len = Math.max(len, m[0].length)
  }
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0)
    result += ' '
  return result
}

function isPlainURL(link: Mark, parent: Node, index: number) {
  if (link.attrs.title || !RE_PROTOCOL_PREFIX.test(link.attrs.href))
    return false
  const content = parent.child(index)
  if (!content.isText || content.text !== link.attrs.href || content.marks.at(-1) !== link)
    return false
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks)
}

/**
 * 将 ProseMirror Node（通常是 doc 或 slice 包装的临时 doc）序列化为 Markdown。
 */
export function nodeToMarkdown(node: Node): string {
  return serializer.serialize(node)
}
