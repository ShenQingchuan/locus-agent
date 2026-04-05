import type {
  SkillCreateResponse,
  SkillDetailResponse,
  SkillFileContentResponse,
  SkillFileSaveResponse,
  SkillFilesResponse,
  SkillPreferenceUpdateResponse,
  SkillsListResponse,
  SkillSource,
} from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

const API_BASE = '/api'

export async function fetchSkills(workspaceRoot?: string): Promise<SkillsListResponse> {
  const query = new URLSearchParams()
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return apiClient.get<SkillsListResponse>(`${API_BASE}/skills${suffix}`)
}

export async function fetchSkillDetail(id: string, workspaceRoot?: string): Promise<SkillDetailResponse> {
  const query = new URLSearchParams({ id })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return apiClient.get<SkillDetailResponse>(`${API_BASE}/skills/detail?${query.toString()}`)
}

export async function fetchSkillFiles(id: string, workspaceRoot?: string): Promise<SkillFilesResponse> {
  const query = new URLSearchParams({ id })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return apiClient.get<SkillFilesResponse>(`${API_BASE}/skills/files?${query.toString()}`)
}

export async function fetchSkillFileContent(
  id: string,
  filePath: string,
  workspaceRoot?: string,
): Promise<SkillFileContentResponse> {
  const query = new URLSearchParams({ id, filePath })
  if (workspaceRoot)
    query.set('workspaceRoot', workspaceRoot)
  return apiClient.get<SkillFileContentResponse>(`${API_BASE}/skills/file-content?${query.toString()}`)
}

export async function saveSkillFileContent(
  input: {
    skillId: string
    filePath: string
    content: string
    workspaceRoot?: string
  },
): Promise<SkillFileSaveResponse> {
  return apiClient.put<SkillFileSaveResponse>(`${API_BASE}/skills/file-content`, input)
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
  return apiClient.put<SkillPreferenceUpdateResponse>(`${API_BASE}/skills/preferences`, input)
}

export async function createSkill(
  input: {
    name: string
    source: SkillSource
    workspaceRoot?: string
    description?: string
  },
): Promise<SkillCreateResponse> {
  return apiClient.post<SkillCreateResponse>(`${API_BASE}/skills/create`, input)
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
