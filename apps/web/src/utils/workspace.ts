/**
 * Derive a short display name from a workspace path.
 * Returns the last path segment, or a placeholder when empty.
 */
export function getWorkspaceDisplayName(path: string): string {
  const normalized = path.trim()
  if (!normalized)
    return '未选择工作空间'
  return normalized.split('/').filter(Boolean).pop() || normalized
}
