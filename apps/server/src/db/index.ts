import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as schema from './schema.js'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: Database | null = null
let _migrationsFolder: string | null = null
let _vecAvailable = false
let _customSqliteLoaded = false

/**
 * 尝试加载支持扩展的系统 SQLite（macOS 上 Bun 内置 SQLite 不支持 loadExtension）
 * 必须在任何 new Database() 调用前执行
 */
function tryLoadCustomSQLite(): void {
  if (_customSqliteLoaded)
    return
  _customSqliteLoaded = true

  if (process.platform !== 'darwin')
    return

  const candidates = [
    '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib', // Apple Silicon
    '/usr/local/opt/sqlite3/lib/libsqlite3.dylib', // Intel Mac
  ]

  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        Database.setCustomSQLite(path)
        return
      }
      catch {
        // ignore, try next
      }
    }
  }
  // 如果没有找到系统 SQLite，使用 Bun 内置版本（sqlite-vec 将不可用）
}

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

  // macOS: 需要系统 SQLite 才能加载 sqlite-vec 扩展
  tryLoadCustomSQLite()

  const dbPath = options?.dbPath ?? getDefaultDbPath()
  _migrationsFolder = options?.migrationsFolder ?? getDefaultMigrationsFolder()

  ensureDir(dirname(dbPath))

  _sqlite = new Database(dbPath, { create: true })
  _sqlite.run('PRAGMA foreign_keys = ON;')

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
function initVec(sqlite: Database): void {
  try {
    // eslint-disable-next-line ts/no-require-imports
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(sqlite)

    const existing = sqlite.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='vec_notes'`,
    ).get() as { sql: string } | null

    if (existing) {
      const needsRebuild
        = !existing.sql.includes(`float[${EXPECTED_VEC_DIM}]`)
          || !existing.sql.includes('distance_metric=cosine')

      if (needsRebuild) {
        console.warn(
          `[sqlite-vec] vec_notes schema mismatch, rebuilding (need ${EXPECTED_VEC_DIM}d cosine)...`,
        )
        sqlite.run(`DROP TABLE vec_notes`)
      }
    }

    sqlite.run(EXPECTED_VEC_SQL)
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
export function getDb() {
  if (!_db)
    initDB()
  return _db!
}

/**
 * 获取底层 bun:sqlite Database 实例
 * 用于 sqlite-vec 等 Drizzle 不直接支持的原始 SQL 操作
 */
export function getSqlite(): Database {
  if (!_sqlite)
    initDB()
  return _sqlite!
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
