import type BetterSqlite3 from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema.js'

const require = createRequire(import.meta.url)

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>

let _db: DrizzleDB | null = null
let _sqlite: BetterSqlite3.Database | null = null
let _migrationsFolder: string | null = null
let _vecAvailable = false

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
  if (_db)
    return

  const dbPath = options?.dbPath ?? getDefaultDbPath()
  _migrationsFolder = options?.migrationsFolder ?? getDefaultMigrationsFolder()

  ensureDir(dirname(dbPath))

  _sqlite = new Database(dbPath)
  _sqlite.exec('PRAGMA foreign_keys = ON;')

  _db = drizzle(_sqlite, { schema })

  // 运行迁移（自动跳过已执行的）
  migrate(_db, { migrationsFolder: _migrationsFolder })

  // sqlite-vec 向量搜索扩展
  initVec(_sqlite)
}

/**
 * 期望的向量维度（与 embedding.ts 中 EMBEDDING_DIM 保持一致）
 */
const EXPECTED_VEC_DIM = 1024

const EXPECTED_VEC_SQL = `CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes USING vec0(
  note_id TEXT PRIMARY KEY,
  embedding float[${EXPECTED_VEC_DIM}] distance_metric=cosine
)`

/**
 * Init sqlite-vec extension and ensure vec_notes table matches expected schema
 * (dimension + distance metric). Drops & recreates on mismatch.
 */
function initVec(sqlite: BetterSqlite3.Database): void {
  try {
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(sqlite)

    const existing = sqlite.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='vec_notes'`,
    ).get() as { sql: string } | undefined

    if (existing) {
      const needsRebuild
        = !existing.sql.includes(`float[${EXPECTED_VEC_DIM}]`)
          || !existing.sql.includes('distance_metric=cosine')

      if (needsRebuild) {
        console.warn(
          `[sqlite-vec] vec_notes schema mismatch, rebuilding (need ${EXPECTED_VEC_DIM}d cosine)...`,
        )
        sqlite.exec(`DROP TABLE vec_notes`)
      }
    }

    sqlite.exec(EXPECTED_VEC_SQL)
    _vecAvailable = true
  }
  catch (err) {
    _vecAvailable = false
    console.warn(
      '[sqlite-vec] Failed to load vector extension, semantic search will be unavailable:',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * sqlite-vec 扩展是否可用
 */
export function isVecAvailable(): boolean {
  return _vecAvailable
}

/**
 * 获取 Drizzle 实例
 * 若未初始化则使用默认路径自动初始化（dev 模式兼容）
 */
export function getDb(): DrizzleDB {
  if (!_db)
    initDB()
  return _db!
}

/**
 * 获取底层 better-sqlite3 Database 实例
 * 用于 sqlite-vec 等 Drizzle 不直接支持的原始 SQL 操作
 */
export function getSqlite(): BetterSqlite3.Database {
  if (!_sqlite)
    initDB()
  return _sqlite!
}

// 向后兼容：现有代码 `import { db } from '../db'` 继续工作
export const db: DrizzleDB = new Proxy({} as DrizzleDB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

/** @deprecated 使用 initDB() 代替 */
export function initDatabase(): void {
  getDb()
}
