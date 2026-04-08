import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * Post-build script: copy server assets (web dist + drizzle migrations) into CLI dist/.
 * The actual TS compilation is handled by tsdown (see tsdown.config.ts).
 */
const root = import.meta.dirname
const distDir = resolve(root, 'dist')

// Copy assets from server dist
const serverDist = resolve(root, '../server/dist')
if (!existsSync(serverDist)) {
  console.error(`Server dist not found: ${serverDist}. Run server build first.`)
  process.exit(1)
}

for (const asset of ['web', 'drizzle']) {
  const src = resolve(serverDist, asset)
  if (!existsSync(src)) {
    console.error(`Server dist/${asset} not found. Run server build first.`)
    process.exit(1)
  }
  const dest = resolve(distDir, asset)
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true })
}

console.log('CLI build complete: dist/, dist/web/, dist/drizzle/')
