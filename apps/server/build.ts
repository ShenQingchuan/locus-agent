/// <reference types="bun" />
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

async function runBuild() {
  const root = import.meta.dir

  const result = await Bun.build({
    entrypoints: [
      resolve(root, 'src/index.ts'),
      resolve(root, 'src/db/index.ts'),
      resolve(root, 'src/config.ts'),
      resolve(root, 'src/agent/providers/index.ts'),
      resolve(root, 'src/settings/index.ts'),
    ],
    outdir: resolve(root, 'dist'),
    target: 'bun',
    external: [
      'onnxruntime-node',
      '@huggingface/transformers',
    ],
    sourcemap: 'external',
  })

  if (!result.success) {
    for (const log of result.logs)
      console.error(log)
    process.exit(1)
  }

  const drizzleSource = resolve(root, 'drizzle')
  if (existsSync(drizzleSource)) {
    const drizzleDest = resolve(root, 'dist/drizzle')
    mkdirSync(drizzleDest, { recursive: true })
    cpSync(drizzleSource, drizzleDest, { recursive: true })
  }

  const webDistSource = resolve(root, '../web/dist')
  if (!existsSync(webDistSource))
    throw new Error(`Web dist not found: ${webDistSource}. Run web build first.`)
  const webDest = resolve(root, 'dist/web')
  mkdirSync(webDest, { recursive: true })
  cpSync(webDistSource, webDest, { recursive: true })
}

runBuild().catch(console.error)
