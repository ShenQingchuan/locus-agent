/**
 * Construct unified diff strings from tool call arguments
 * for rendering with DiffViewer.
 */

// ---------------------------------------------------------------------------
// Normalized diff extraction — provider-agnostic
// ---------------------------------------------------------------------------

export interface DiffableToolArgs {
  type: 'replace' | 'new_file'
  filePath: string
  oldText?: string
  newText: string
}

/**
 * Extract diff-renderable arguments from a tool call, regardless of provider.
 * Returns `null` when the tool is not a recognised file-editing operation.
 *
 * To add a new provider convention, append a branch here — no other file
 * needs to change.
 */
export function extractDiffableArgs(
  toolName: string,
  args: Record<string, unknown>,
): DiffableToolArgs | null {
  // --- Our agent: str_replace { file_path, old_string, new_string } ---
  if (toolName === 'str_replace' && typeof args.old_string === 'string') {
    return {
      type: 'replace',
      filePath: String(args.file_path ?? ''),
      oldText: args.old_string,
      newText: String(args.new_string ?? ''),
    }
  }

  // --- Our agent: write_file { file_path, content } ---
  if (toolName === 'write_file' && typeof args.content === 'string') {
    return {
      type: 'new_file',
      filePath: String(args.file_path ?? ''),
      newText: args.content,
    }
  }

  // --- Kimi CLI: StrReplaceFile { path, edit: { old, new } } ---
  if (toolName === 'StrReplaceFile') {
    const edit = args.edit as { old?: string, new?: string } | undefined
    if (edit && typeof edit.old === 'string') {
      return {
        type: 'replace',
        filePath: String(args.path ?? ''),
        oldText: edit.old,
        newText: String(edit.new ?? ''),
      }
    }
  }

  // --- Kimi CLI: WriteFile { path, content } ---
  if (toolName === 'WriteFile' && typeof args.content === 'string') {
    return {
      type: 'new_file',
      filePath: String(args.path ?? ''),
      newText: args.content,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Unified diff builders
// ---------------------------------------------------------------------------

/**
 * Build a unified diff for a str_replace operation.
 *
 * Produces a valid unified diff with `-` (removed) and `+` (added) lines
 * that `@pierre/diffs` can parse and render.
 */
export function buildReplaceDiff(
  filePath: string,
  oldStr: string,
  newStr: string,
): string {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  const removed = oldLines.map(l => `-${l}`).join('\n')
  const added = newLines.map(l => `+${l}`).join('\n')

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    removed,
    added,
  ].join('\n')
}

/**
 * Build a unified diff for a newly created file (all additions).
 */
export function buildNewFileDiff(
  filePath: string,
  content: string,
): string {
  const lines = content.split('\n')
  const added = lines.map(l => `+${l}`).join('\n')

  return [
    `--- /dev/null`,
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    added,
  ].join('\n')
}
