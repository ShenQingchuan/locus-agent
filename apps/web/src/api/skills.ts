import type {
  SkillCreateResponse,
  SkillDetailResponse,
  SkillFileContentResponse,
  SkillFileSaveResponse,
  SkillFilesResponse,
  SkillPreferenceUpdateResponse,
  SkillsListResponse,
  SkillSource,
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

export async function fetchSkillFiles(id: string, workspaceRoot?: string): Promise<SkillFilesResponse> {
  const query = new URLSearchParams({ id })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return request<SkillFilesResponse>(`/skills/files?${query.toString()}`)
}

export async function fetchSkillFileContent(
  id: string,
  filePath: string,
  workspaceRoot?: string,
): Promise<SkillFileContentResponse> {
  const query = new URLSearchParams({ id, filePath })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return request<SkillFileContentResponse>(`/skills/file-content?${query.toString()}`)
}

export async function saveSkillFileContent(
  input: {
    skillId: string
    filePath: string
    content: string
    workspaceRoot?: string
  },
): Promise<SkillFileSaveResponse> {
  return request<SkillFileSaveResponse>('/skills/file-content', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
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

export async function createSkill(
  input: {
    name: string
    source: SkillSource
    workspaceRoot?: string
    description?: string
  },
): Promise<SkillCreateResponse> {
  return request<SkillCreateResponse>('/skills/create', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function watchSkillFiles(
  workspaceRoot: string | undefined,
  onChanged: () => void,
): () => void {
  const query = new URLSearchParams()
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const url = `${API_BASE}/skills/watch${suffix}`

  let es: EventSource | null = null
  let closed = false

  function connect() {
    if (closed)
      return
    es = new EventSource(url)

    es.onmessage = (event) => {
      if (event.data === 'changed') {
        onChanged()
      }
    }

    es.onerror = () => {
      es?.close()
      if (!closed) {
        // Reconnect after a delay
        setTimeout(connect, 3000)
      }
    }
  }

  connect()

  return () => {
    closed = true
    es?.close()
  }
}
