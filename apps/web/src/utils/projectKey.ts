function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function normalizeWorkspacePath(path: string): string {
  const normalized = path.replace(/\\+/g, '/').replace(/\/+$/g, '')
  if (/^[A-Z]:/.test(normalized)) {
    return `${normalized[0]!.toLowerCase()}${normalized.slice(1)}`
  }
  return normalized
}

export async function createProjectKey(workspacePath: string): Promise<string> {
  const normalized = normalizeWorkspacePath(workspacePath)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(normalized)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return toHex(new Uint8Array(digest)).slice(0, 16)
  }

  let hash = 2166136261
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
