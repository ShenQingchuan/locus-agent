export type SkillSource = 'system' | 'project'

export interface SkillResource {
  path: string
  type: 'script' | 'reference' | 'asset' | 'other'
}

export interface SkillSummary {
  id: string
  name: string
  description: string
  source: SkillSource
  path: string
  rootDir: string
  scopePath?: string
  enabled: boolean
  modelInvocable: boolean
  userInvocable: boolean
  effective: boolean
  overriddenById?: string
  updatedAt: string
  resourceCount: number
  hasScripts: boolean
  hasReferences: boolean
  hasAssets: boolean
}

export interface SkillDetail extends SkillSummary {
  content: string
  rawFrontmatter: string
  frontmatter: Record<string, unknown>
  resources: SkillResource[]
}

export interface SkillsListResponse {
  workspaceRoot?: string
  skills: SkillSummary[]
}

export interface SkillDetailResponse {
  workspaceRoot?: string
  skill: SkillDetail
}

export interface SkillPreferenceUpdateRequest {
  id: string
  enabled?: boolean
  modelInvocable?: boolean
  userInvocable?: boolean
}

export interface SkillPreferenceUpdateResponse {
  success: boolean
  skill?: SkillSummary
}

export interface SkillFileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: SkillFileNode[]
}

export interface SkillFilesResponse {
  rootDir: string
  files: SkillFileNode[]
}

export interface SkillCreateRequest {
  name: string
  source: SkillSource
  workspaceRoot?: string
  description?: string
}

export interface SkillCreateResponse {
  success: boolean
  skill?: SkillSummary
}

export interface SkillFileContentResponse {
  path: string
  content: string
  language: string
}

export interface SkillFileSaveRequest {
  skillId: string
  filePath: string
  content: string
  workspaceRoot?: string
}

export interface SkillFileSaveResponse {
  success: boolean
}
