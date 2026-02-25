import type { Node } from 'prosemirror-model'
import { MarkdownSerializer } from 'prosemirror-markdown'

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
      const backticks = node.textContent.match(/`{3,}/g)
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
        (state as any).flushClose(1)

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
          node.attrs.src.replace(/[()]/g, '\\$&')
        }${node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : ''})`,
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
      state.text(node.text!, !(state as any).inAutolink)
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
        ;(state as any).inAutolink = isPlainURL(mark, parent, index)
        return (state as any).inAutolink ? '<' : '['
      },
      close(state, mark) {
        const { inAutolink } = state as any
        ;(state as any).inAutolink = undefined
        if (inAutolink)
          return '>'
        return `](${mark.attrs.href.replace(/[()"/]/g, '\\$&')}${
          mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : ''
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
  const ticks = /`+/g
  let m: RegExpExecArray | null
  let len = 0
  if (node.isText) {
    // eslint-disable-next-line no-cond-assign
    while (m = ticks.exec(node.text!))
      len = Math.max(len, m[0].length)
  }
  let result = len > 0 && side > 0 ? ' `' : '`'
  for (let i = 0; i < len; i++) result += '`'
  if (len > 0 && side < 0)
    result += ' '
  return result
}

function isPlainURL(link: any, parent: Node, index: number) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href))
    return false
  const content = parent.child(index)
  if (!content.isText || content.text !== link.attrs.href || content.marks[content.marks.length - 1] !== link)
    return false
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks)
}

/**
 * 将 ProseMirror Node（通常是 doc 或 slice 包装的临时 doc）序列化为 Markdown。
 */
export function nodeToMarkdown(node: Node): string {
  return serializer.serialize(node)
}
