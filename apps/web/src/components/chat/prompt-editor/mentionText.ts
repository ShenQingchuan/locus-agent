import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model'

export type WorkspaceMentionKind = 'workspace-file' | 'workspace-directory'

export interface ResolvedWorkspaceMention {
  id: string
  label: string
  kind: WorkspaceMentionKind
}

export interface PromptDocBuildResult {
  doc: ProseMirrorNode
  hasWorkspaceMentions: boolean
}

const RE_MENTION_TOKEN = /@\S+/g

export function isWorkspaceMentionKind(kind: string | undefined): kind is WorkspaceMentionKind {
  return kind === 'workspace-file' || kind === 'workspace-directory'
}

export function extractPromptText(doc: any): string {
  if (!doc)
    return ''

  const parts: string[] = []

  function walk(node: any) {
    if (node.isText) {
      parts.push(node.text || '')
      return
    }
    if (node.type?.name === 'mention') {
      parts.push(node.attrs?.value || '')
      return
    }
    if (node.type?.name === 'hardBreak') {
      parts.push('\n')
      return
    }
    if (node.content) {
      node.content.forEach((child: any) => walk(child))
    }
    if (node.isBlock && node.type?.name !== 'doc') {
      parts.push('\n')
    }
  }

  walk(doc)
  return parts.join('').trim()
}

function createMentionNode(schema: Schema, mention: ResolvedWorkspaceMention) {
  const mentionType = schema.nodes.mention
  if (!mentionType)
    return null

  return mentionType.create({
    id: mention.id,
    value: `@${mention.label}`,
    kind: mention.kind,
  })
}

function appendTextNode(content: ProseMirrorNode[], schema: Schema, text: string) {
  if (!text)
    return
  content.push(schema.text(text))
}

function parseInlineContent(
  line: string,
  schema: Schema,
  resolveWorkspaceMentionToken?: (token: string) => ResolvedWorkspaceMention | null,
): { content: ProseMirrorNode[], hasWorkspaceMentions: boolean } {
  const content: ProseMirrorNode[] = []
  let hasWorkspaceMentions = false
  let lastIndex = 0

  for (const match of line.matchAll(RE_MENTION_TOKEN)) {
    const fullMatch = match[0]
    const index = match.index ?? -1
    if (!fullMatch || index < 0)
      continue

    appendTextNode(content, schema, line.slice(lastIndex, index))

    const resolved = resolveWorkspaceMentionToken?.(fullMatch.slice(1))
    const mentionNode = resolved ? createMentionNode(schema, resolved) : null
    if (mentionNode) {
      content.push(mentionNode)
      hasWorkspaceMentions = true
    }
    else {
      appendTextNode(content, schema, fullMatch)
    }

    lastIndex = index + fullMatch.length
  }

  appendTextNode(content, schema, line.slice(lastIndex))
  return { content, hasWorkspaceMentions }
}

export function buildPromptDocFromText(
  text: string,
  schema: Schema,
  resolveWorkspaceMentionToken?: (token: string) => ResolvedWorkspaceMention | null,
): PromptDocBuildResult | null {
  const paragraphType = schema.nodes.paragraph
  const docType = schema.nodes.doc
  if (!paragraphType || !docType)
    return null

  const lines = text.split('\n')
  let hasWorkspaceMentions = false
  const blocks = lines.map((line) => {
    const result = parseInlineContent(line, schema, resolveWorkspaceMentionToken)
    hasWorkspaceMentions = hasWorkspaceMentions || result.hasWorkspaceMentions
    return paragraphType.create(null, result.content)
  })

  return {
    doc: docType.create(null, blocks),
    hasWorkspaceMentions,
  }
}
