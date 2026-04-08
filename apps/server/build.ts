import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Post-build script: copy drizzle migrations and web dist into dist/.
 * The actual TS compilation is handled by tsdown (see tsdown.config.ts).
 */
const root = import.meta.dirname

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
