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
