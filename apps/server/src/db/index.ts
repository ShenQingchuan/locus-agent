import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema.js'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _migrationsFolder: string | null = null

function getDefaultDbPath(): string {
  return resolve(process.cwd(), './data/locus.db')
}

function getDefaultMigrationsFolder(): string {
  // dev 模式：相对于 server 包的 drizzle/ 目录
  return resolve(import.meta.dirname, '../../drizzle')
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

export interface InitDBOptions {
  dbPath?: string
  migrationsFolder?: string
}

/**
 * 初始化数据库，运行 Drizzle migrations
 * 可多次调用，后续调用为 no-op
 */
export function initDB(options?: InitDBOptions): void {
  if (_db) return

  const dbPath = options?.dbPath ?? getDefaultDbPath()
  _migrationsFolder = options?.migrationsFolder ?? getDefaultMigrationsFolder()

  ensureDir(dirname(dbPath))

  const sqlite = new Database(dbPath, { create: true })
  sqlite.run('PRAGMA foreign_keys = ON;')

  _db = drizzle(sqlite, { schema })

  // 运行迁移（自动跳过已执行的）
  migrate(_db, { migrationsFolder: _migrationsFolder })
}

/**
 * 获取 Drizzle 实例
 * 若未初始化则使用默认路径自动初始化（dev 模式兼容）
 */
export function getDb() {
  if (!_db) initDB()
  return _db!
}

// 向后兼容：现有代码 `import { db } from '../db'` 继续工作
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

/** @deprecated 使用 initDB() 代替 */
export function initDatabase(): void {
  getDb()
}

export * from './schema.js'
