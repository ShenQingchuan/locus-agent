/**
 * Construct unified diff strings from tool call arguments
 * for rendering with DiffViewer.
 */

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
