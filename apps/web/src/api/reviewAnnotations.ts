import { apiClient } from './client.js'

const API_BASE = '/api/review-annotations'

export interface ReviewAnnotationDTO {
  id: string
  groupId: string
  filePath: string
  side: 'additions' | 'deletions'
  lineStart: number
  lineEnd: number
  comment: string
  createdAt: string
}

export interface ReviewAnnotationGroupDTO {
  id: string
  projectKey: string
  title: string
  annotations: ReviewAnnotationDTO[]
  createdAt: string
  updatedAt: string
}

export async function fetchAnnotationGroups(projectKey: string): Promise<ReviewAnnotationGroupDTO[]> {
  const { groups } = await apiClient.get<{ groups: ReviewAnnotationGroupDTO[] }>(
    `${API_BASE}?projectKey=${encodeURIComponent(projectKey)}`,
  )
  return groups
}

export async function createAnnotationGroup(input: {
  id?: string
  projectKey: string
  title: string
}): Promise<ReviewAnnotationGroupDTO> {
  return apiClient.post<ReviewAnnotationGroupDTO>(`${API_BASE}/groups`, input)
}

export async function renameAnnotationGroup(groupId: string, title: string): Promise<void> {
  await apiClient.patch(`${API_BASE}/groups/${groupId}`, { title })
}

export async function deleteAnnotationGroup(groupId: string): Promise<void> {
  await apiClient.del(`${API_BASE}/groups/${groupId}`)
}

export async function addAnnotation(input: {
  id?: string
  groupId: string
  filePath: string
  side: 'additions' | 'deletions'
  lineStart: number
  lineEnd: number
  comment: string
}): Promise<ReviewAnnotationDTO> {
  return apiClient.post<ReviewAnnotationDTO>(`${API_BASE}/annotations`, input)
}

export async function updateAnnotation(annotationId: string, comment: string): Promise<void> {
  await apiClient.patch(`${API_BASE}/annotations/${annotationId}`, { comment })
}

export async function removeAnnotation(annotationId: string): Promise<void> {
  await apiClient.del(`${API_BASE}/annotations/${annotationId}`)
}

export async function clearAllAnnotations(projectKey: string): Promise<void> {
  await apiClient.del(`${API_BASE}?projectKey=${encodeURIComponent(projectKey)}`)
}
