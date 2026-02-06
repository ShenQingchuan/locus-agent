import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema.js'

// 数据库文件路径
const DB_PATH = resolve(process.cwd(), './data/locus.db')

// 确保数据目录存在
function ensureDataDir(): void {
  const dataDir = dirname(DB_PATH)
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
}

// 初始化数据库
ensureDataDir()
const sqlite = new Database(DB_PATH, { create: true })

// 启用外键约束
sqlite.exec('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite, { schema })

// 初始化数据库表（如果不存在）
export function initDatabase(): void {
  // 创建 conversations 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  // 创建 messages 表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_results TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  // 创建索引以加速查询
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
  `)
}

// 自动初始化数据库
initDatabase()

export * from './schema.js'
