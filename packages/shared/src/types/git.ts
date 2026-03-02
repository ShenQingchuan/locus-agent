/** Git file status codes from `git status --porcelain` */
export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'U' | '??'

/** A single changed file in the workspace */
export interface GitChangedFile {
  /** Relative path from workspace root */
  filePath: string
  /** Git status code */
  status: GitFileStatus
  /** Whether this change is staged (in the index) */
  staged: boolean
  /** Lines added (null if binary or unavailable) */
  additions: number | null
  /** Lines deleted (null if binary or unavailable) */
  deletions: number | null
}

export interface GitStatusResponse {
  rootPath: string
  isGitRepo: boolean
  files: GitChangedFile[]
  summary: {
    totalFiles: number
    totalAdditions: number
    totalDeletions: number
  }
}

export interface GitDiffResponse {
  filePath: string | null
  /** Unified diff string compatible with @pierre/diffs */
  patch: string
}

export interface GitCommitRequest {
  path: string
  message: string
  /** Stage & commit only these files; empty = all changes */
  filePaths?: string[]
}

export interface GitCommitResponse {
  success: boolean
  commitHash?: string
  message?: string
}

export interface GitDiscardRequest {
  path: string
  filePaths: string[]
}

export interface GitDiscardResponse {
  success: boolean
  message?: string
}

export interface GitStageRequest {
  path: string
  filePaths: string[]
}

export interface GitStageResponse {
  success: boolean
  message?: string
}

export interface GitUnstageRequest {
  path: string
  filePaths: string[]
}

export interface GitUnstageResponse {
  success: boolean
  message?: string
}
