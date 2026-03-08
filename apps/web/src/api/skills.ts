import type {
  SkillDetailResponse,
  SkillPreferenceUpdateResponse,
  SkillsListResponse,
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

export async function fetchSkills(workspaceRoot?: string): Promise<SkillsListResponse> {
  const query = new URLSearchParams()
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return request<SkillsListResponse>(`/skills${suffix}`)
}

export async function fetchSkillDetail(id: string, workspaceRoot?: string): Promise<SkillDetailResponse> {
  const query = new URLSearchParams({ id })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return request<SkillDetailResponse>(`/skills/detail?${query.toString()}`)
}

export async function updateSkillPreference(
  input: {
    id: string
    workspaceRoot?: string
    enabled?: boolean
    modelInvocable?: boolean
    userInvocable?: boolean
  },
): Promise<SkillPreferenceUpdateResponse> {
  return request<SkillPreferenceUpdateResponse>('/skills/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}
