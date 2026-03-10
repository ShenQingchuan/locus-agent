import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = resolve(cliRoot, 'dist')
const webDistSource = resolve(cliRoot, '../web/dist')
const drizzleSource = resolve(cliRoot, '../server/drizzle')
const bundledWebDir = resolve(distDir, 'web')
const bundledDrizzleDir = resolve(distDir, 'drizzle')

if (!existsSync(webDistSource))
  throw new Error(`Web dist not found: ${webDistSource}. Run web build first.`)

if (!existsSync(drizzleSource))
  throw new Error(`Drizzle folder not found: ${drizzleSource}`)

rmSync(distDir, { force: true, recursive: true })

execFileSync('bun', [
  'build',
  'src/index.ts',
  '--outdir',
  'dist',
  '--target',
  'bun',
  '--external',
  '@huggingface/transformers',
  '--external',
  'onnxruntime-node',
], {
  cwd: cliRoot,
  stdio: 'inherit',
})

mkdirSync(bundledWebDir, { recursive: true })
mkdirSync(bundledDrizzleDir, { recursive: true })

cpSync(webDistSource, bundledWebDir, { recursive: true })
cpSync(drizzleSource, bundledDrizzleDir, { recursive: true })

console.log('CLI build complete: dist/, dist/web/, dist/drizzle/')
