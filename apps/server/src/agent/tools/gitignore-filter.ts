import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import ignore from 'ignore'
import { getWorkspaceRoot } from './workspace-root.js'

type IgnoreFn = (absolutePath: string, isDirectory?: boolean) => boolean

const matcherCache = new Map<string, Promise<IgnoreFn>>()

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

function toRelativeFromRoot(absPath: string, workspaceRoot: string): string | null {
  const rel = toPosixPath(relative(workspaceRoot, absPath))
  if (!rel || rel === '.')
    return ''
  if (rel.startsWith('../') || rel === '..')
    return null
  return rel
}

async function readIfExists(filePath: string): Promise<string | null> {
  if (!existsSync(filePath))
    return null
  try {
    return await readFile(filePath, 'utf8')
  }
  catch {
    return null
  }
}

async function buildMatcher(workspaceRoot: string): Promise<IgnoreFn> {
  const ig = ignore()

  const rootGitignore = await readIfExists(resolve(workspaceRoot, '.gitignore'))
  if (rootGitignore)
    ig.add(rootGitignore)

  const gitExclude = await readIfExists(resolve(workspaceRoot, '.git', 'info', 'exclude'))
  if (gitExclude)
    ig.add(gitExclude)

  return (absolutePath: string, isDirectory = false): boolean => {
    const rel = toRelativeFromRoot(absolutePath, workspaceRoot)
    if (rel === null)
      return false
    if (rel === '')
      return false

    return ig.ignores(rel) || (isDirectory ? ig.ignores(`${rel}/`) : false)
  }
}

export async function getGitignoreFilter(rootPath?: string): Promise<IgnoreFn> {
  const workspaceRoot = resolve(rootPath || getWorkspaceRoot())
  const cached = matcherCache.get(workspaceRoot)
  if (cached)
    return cached

  const promise = buildMatcher(workspaceRoot)
  matcherCache.set(workspaceRoot, promise)
  return promise
}
