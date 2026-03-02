import type {
  GitCommitResponse,
  GitDiffResponse,
  GitDiscardResponse,
  GitStatusResponse,
  WorkspaceListResponse,
  WorkspaceRootsResponse,
  WorkspaceTreeResponse,
} from '@locus-agent/shared'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || `Request failed: ${res.status}`)
  }

  return res.json()
}

export async function fetchWorkspaceRoots(): Promise<WorkspaceRootsResponse> {
  return request<WorkspaceRootsResponse>('/workspace/roots')
}

export async function fetchWorkspaceDirectories(path: string): Promise<WorkspaceListResponse> {
  const query = new URLSearchParams({ path })
  return request<WorkspaceListResponse>(`/workspace/list?${query.toString()}`)
}

export async function openWorkspace(path: string): Promise<WorkspaceTreeResponse> {
  const query = new URLSearchParams({ path })
  return request<WorkspaceTreeResponse>(`/workspace/tree?${query.toString()}`)
}

export async function fetchGitStatus(path: string): Promise<GitStatusResponse> {
  const query = new URLSearchParams({ path })
  return request<GitStatusResponse>(`/workspace/git/status?${query.toString()}`)
}

export async function fetchGitDiff(path: string, file?: string): Promise<GitDiffResponse> {
  const params = new URLSearchParams({ path })
  if (file) {
    params.set('file', file)
  }
  return request<GitDiffResponse>(`/workspace/git/diff?${params.toString()}`)
}

export async function commitChanges(path: string, message: string): Promise<GitCommitResponse> {
  return request<GitCommitResponse>('/workspace/git/commit', {
    method: 'POST',
    body: JSON.stringify({ path, message }),
  })
}

export async function discardChanges(path: string, filePaths: string[] = []): Promise<GitDiscardResponse> {
  return request<GitDiscardResponse>('/workspace/git/discard', {
    method: 'POST',
    body: JSON.stringify({ path, filePaths }),
  })
}
