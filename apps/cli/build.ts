/// <reference types="bun" />
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = import.meta.dir
const distDir = resolve(root, 'dist')

// Clean dist before build to remove stale files
if (existsSync(distDir))
  rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

// Build
const result = await Bun.build({
  entrypoints: [resolve(root, 'src/index.ts')],
  outdir: distDir,
  target: 'bun',
  external: [
    '@huggingface/transformers',
    'onnxruntime-node',
  ],
  sourcemap: false,
  minify: false,
  define: {
    'import.meta.main': 'false',
  },
})

if (!result.success) {
  for (const log of result.logs)
    console.error(log)
  process.exit(1)
}

// Prepend shebang
const outFile = resolve(distDir, 'index.js')
const content = await Bun.file(outFile).text()
writeFileSync(outFile, `#!/usr/bin/env bun\n${content}`)

// Copy assets from server dist
const serverDist = resolve(root, '../server/dist')
if (!existsSync(serverDist))
  throw new Error(`Server dist not found: ${serverDist}. Run server build first.`)

for (const asset of ['web', 'drizzle']) {
  const src = resolve(serverDist, asset)
  if (!existsSync(src))
    throw new Error(`Server dist/${asset} not found. Run server build first.`)
  const dest = resolve(distDir, asset)
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
}

console.log('CLI build complete: dist/, dist/web/, dist/drizzle/')
