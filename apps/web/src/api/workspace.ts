import type {
  GitCommitResponse,
  GitDiffResponse,
  GitDiscardResponse,
  GitPushResponse,
  GitStageResponse,
  GitStatusResponse,
  GitUnstageResponse,
  MentionSearchResponse,
  WorkspaceListResponse,
  WorkspaceRootsResponse,
  WorkspaceTreeResponse,
} from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

const API_BASE = '/api'

export async function fetchWorkspaceRoots(): Promise<WorkspaceRootsResponse> {
  return apiClient.get<WorkspaceRootsResponse>(`${API_BASE}/workspace/roots`)
}

export async function fetchWorkspaceDirectories(path: string): Promise<WorkspaceListResponse> {
  const query = new URLSearchParams({ path })
  return apiClient.get<WorkspaceListResponse>(`${API_BASE}/workspace/list?${query.toString()}`)
}

export async function openWorkspace(path: string): Promise<WorkspaceTreeResponse> {
  const query = new URLSearchParams({ path })
  return apiClient.get<WorkspaceTreeResponse>(`${API_BASE}/workspace/tree?${query.toString()}`)
}

export async function fetchMentionSearch(
  query: string,
  basePath?: string,
  includeHidden = true,
): Promise<MentionSearchResponse> {
  const params = new URLSearchParams({ query })
  if (basePath)
    params.set('basePath', basePath)
  if (includeHidden)
    params.set('includeHidden', 'true')
  return apiClient.get<MentionSearchResponse>(`${API_BASE}/workspace/mention-search?${params.toString()}`)
}

export async function fetchGitStatus(path: string): Promise<GitStatusResponse> {
  const query = new URLSearchParams({ path })
  return apiClient.get<GitStatusResponse>(`${API_BASE}/workspace/git/status?${query.toString()}`)
}

export async function fetchGitDiff(path: string, file?: string, staged?: boolean): Promise<GitDiffResponse> {
  const params = new URLSearchParams({ path })
  if (file)
    params.set('file', file)
  if (staged !== undefined)
    params.set('staged', String(staged))
  return apiClient.get<GitDiffResponse>(`${API_BASE}/workspace/git/diff?${params.toString()}`)
}

export async function stageFiles(path: string, filePaths: string[]): Promise<GitStageResponse> {
  return apiClient.post<GitStageResponse>(`${API_BASE}/workspace/git/stage`, { path, filePaths })
}

export async function unstageFiles(path: string, filePaths: string[]): Promise<GitUnstageResponse> {
  return apiClient.post<GitUnstageResponse>(`${API_BASE}/workspace/git/unstage`, { path, filePaths })
}

export async function commitChanges(path: string, message: string, filePaths: string[] = []): Promise<GitCommitResponse> {
  return apiClient.post<GitCommitResponse>(`${API_BASE}/workspace/git/commit`, { path, message, filePaths })
}

export async function discardChanges(path: string, filePaths: string[] = []): Promise<GitDiscardResponse> {
  return apiClient.post<GitDiscardResponse>(`${API_BASE}/workspace/git/discard`, { path, filePaths })
}

export async function pushChanges(path: string): Promise<GitPushResponse> {
  return apiClient.post<GitPushResponse>(`${API_BASE}/workspace/git/push`, { path })
}

export async function suggestCommitMessage(path: string): Promise<{ message: string }> {
  return apiClient.post<{ message: string }>(`${API_BASE}/workspace/git/suggest-commit-message`, { path })
}
