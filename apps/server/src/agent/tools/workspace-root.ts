import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const ROOT_MARKERS = [
  'pnpm-workspace.yaml',
  '.git',
]

let cachedWorkspaceRoot: string | null = null

function hasRootMarker(dir: string): boolean {
  return ROOT_MARKERS.some(marker => existsSync(join(dir, marker)))
}

function findWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir)

  while (true) {
    if (hasRootMarker(current)) {
      return current
    }

    const parent = dirname(current)
    if (parent === current) {
      return resolve(startDir)
    }
    current = parent
  }
}

export function getWorkspaceRoot(): string {
  if (cachedWorkspaceRoot)
    return cachedWorkspaceRoot

  const fromEnv = process.env.LOCUS_WORKSPACE_ROOT?.trim()
  if (fromEnv) {
    cachedWorkspaceRoot = resolve(fromEnv)
    return cachedWorkspaceRoot
  }

  cachedWorkspaceRoot = findWorkspaceRoot(process.cwd())
  return cachedWorkspaceRoot
}

export function getServerCwd(): string {
  return process.cwd()
}
