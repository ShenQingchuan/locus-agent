import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getDataDir } from '../settings/paths.js'

const ONNX_DEPS = ['@huggingface/transformers', 'onnxruntime-node'] as const

export function getDepsDir(): string {
  return join(getDataDir(), 'deps')
}

function getDepsNodeModulesDir(): string {
  return join(getDepsDir(), 'node_modules')
}

export function isLocalDepsInstalled(): boolean {
  const nodeModules = getDepsNodeModulesDir()
  return ONNX_DEPS.every(dep =>
    existsSync(join(nodeModules, ...dep.split('/'))),
  )
}

/**
 * Resolve and dynamically import @huggingface/transformers.
 * In dev: standard import() finds it in monorepo node_modules.
 * In production CLI: uses createRequire to resolve from data-dir deps.
 */
export async function importTransformersFromDeps(): Promise<typeof import('@huggingface/transformers')> {
  try {
    return await import('@huggingface/transformers')
  }
  catch {
    if (!isLocalDepsInstalled())
      throw new Error('ONNX_DEPS_NOT_INSTALLED')

    const depsRequire = createRequire(join(getDepsNodeModulesDir(), '_'))
    const resolved = depsRequire.resolve('@huggingface/transformers')
    return await import(resolved)
  }
}

export function installLocalDeps(
  onOutput?: (data: string) => void,
): Promise<{ success: boolean, error?: string }> {
  return new Promise((resolve) => {
    const depsDir = getDepsDir()
    mkdirSync(depsDir, { recursive: true })

    const pkgPath = join(depsDir, 'package.json')
    if (!existsSync(pkgPath)) {
      writeFileSync(pkgPath, JSON.stringify({
        name: 'locus-local-deps',
        private: true,
      }))
    }

    const child = spawn('bun', ['add', ...ONNX_DEPS], {
      cwd: depsDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (data) => {
      onOutput?.(String(data))
    })

    child.stderr.on('data', (data) => {
      onOutput?.(String(data))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true })
      }
      else {
        resolve({ success: false, error: `bun add exited with code ${code}` })
      }
    })

    child.on('error', (err) => {
      resolve({ success: false, error: err.message })
    })
  })
}

export function uninstallLocalDeps(): void {
  const depsDir = getDepsDir()
  if (existsSync(depsDir)) {
    rmSync(depsDir, { recursive: true })
  }
}
