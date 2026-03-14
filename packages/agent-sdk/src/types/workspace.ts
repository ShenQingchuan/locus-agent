export interface WorkspaceRoot {
  name: string
  path: string
}

export interface WorkspaceRootsResponse {
  roots: WorkspaceRoot[]
  defaultPath: string
}

export interface WorkspaceDirectoryEntry {
  name: string
  path: string
  hasChildren: boolean
}

export interface WorkspaceListResponse {
  path: string
  entries: WorkspaceDirectoryEntry[]
  truncated: boolean
}

export interface WorkspaceTreeNode {
  id: string
  label: string
  type: 'file' | 'directory'
  children?: WorkspaceTreeNode[]
}

export interface WorkspaceTreeResponse {
  rootPath: string
  rootName: string
  tree: WorkspaceTreeNode[]
  truncated: boolean
  scannedCount: number
}

export interface MentionSearchEntry {
  name: string
  absolutePath: string
  relativePath: string
  type: 'file' | 'directory'
}

export interface MentionSearchResponse {
  basePath: string
  resolvedDir: string
  entries: MentionSearchEntry[]
  truncated: boolean
}
