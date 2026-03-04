import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { getWorkspaceRoot } from './workspace-root.js'

/**
 * Resolve a user-supplied file path to an absolute path.
 *
 * Handles three common forms:
 *  1. Absolute paths  — returned as-is  (`/home/user/.zshrc`)
 *  2. Tilde paths     — `~` expanded to the user's home directory (`~/.zshrc`)
 *  3. Relative paths  — resolved against `cwd` (defaults to workspace root)
 */
export function resolveToolPath(input: string, cwd = getWorkspaceRoot()): string {
  if (input.startsWith('~')) {
    return resolve(homedir(), input.slice(input.startsWith('~/') ? 2 : 1))
  }
  return isAbsolute(input) ? input : resolve(cwd, input)
}
