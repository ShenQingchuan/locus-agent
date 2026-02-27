import { Buffer } from 'node:buffer'
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
const EXPECTED_VEC_DIM = 384

/**
 * 初始化 sqlite-vec 向量搜索扩展
 * 如果加载失败（平台不支持等），设置 _vecAvailable = false 并记录警告
 * 如果已有 vec_notes 表的维度与当前模型不匹配，自动重建
 */
function initVec(sqlite: Database): void {
  try {
    // eslint-disable-next-line ts/no-require-imports
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(sqlite)

    // 检测已有 vec_notes 表的维度是否与当前模型匹配
    // 如果不匹配（例如之前用了 768 维模型），需要 drop 重建
    const existingTable = sqlite.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='vec_notes'`,
    ).get() as { name: string } | null

    if (existingTable) {
      try {
        // 尝试插入一个测试向量来检测维度是否匹配
        const testVector = new Float32Array(EXPECTED_VEC_DIM)
        sqlite.run(`INSERT INTO vec_notes(note_id, embedding) VALUES ('__dim_check__', ?)`, [
          Buffer.from(testVector.buffer),
        ])
        sqlite.run(`DELETE FROM vec_notes WHERE note_id = '__dim_check__'`)
      }
      catch {
        // 维度不匹配，drop 并重建
        console.warn(
          `[sqlite-vec] vec_notes dimension mismatch detected, rebuilding with ${EXPECTED_VEC_DIM} dimensions...`,
        )
        sqlite.run(`DROP TABLE vec_notes`)
      }
    }

    // 创建向量虚拟表（384 维 float32 向量，匹配 multilingual-e5-small）
    sqlite.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes USING vec0(
        note_id TEXT PRIMARY KEY,
        embedding float[${EXPECTED_VEC_DIM}]
      );
    `)

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
