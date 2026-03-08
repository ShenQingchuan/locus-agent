import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'

export function isWithinRoot(targetPath: string, rootPath: string): boolean {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${sep}`)
}

export async function getAllowedRoots(): Promise<string[]> {
  const candidates = [
    process.cwd(),
    join(homedir(), 'workspace'),
    join(homedir(), 'projects'),
    homedir(),
  ]

  const resolved = await Promise.all(candidates.map(async (path) => {
    try {
      return await realpath(path)
    }
    catch {
      return null
    }
  }))

  return Array.from(new Set(resolved.filter((path): path is string => !!path)))
}

export async function resolveAllowedDirectory(inputPath: string | undefined): Promise<string> {
  if (!inputPath) {
    throw new Error('Missing path query parameter')
  }

  const candidate = resolve(inputPath)
  const normalized = await realpath(candidate)
  const allowedRoots = await getAllowedRoots()

  if (!allowedRoots.some(root => isWithinRoot(normalized, root))) {
    throw new Error('Path is outside allowed workspace roots')
  }

  await readdir(normalized, { withFileTypes: true })

  return normalized
}
