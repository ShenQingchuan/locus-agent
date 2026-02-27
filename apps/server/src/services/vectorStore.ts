import { getSqlite, isVecAvailable } from '../db/index.js'
import { EMBEDDING_DIM } from './embedding.js'

/**
 * 插入或更新笔记的 embedding 向量
 */
export function upsertNoteEmbedding(noteId: string, embedding: Float32Array): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()

  // vec0 不支持 INSERT OR REPLACE，先删再插
  sqlite.run('DELETE FROM vec_notes WHERE note_id = ?', [noteId])
  sqlite.run(
    'INSERT INTO vec_notes(note_id, embedding) VALUES (?, ?)',
    [noteId, new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength)],
  )
}

/**
 * 删除笔记的 embedding 向量
 */
export function deleteNoteEmbedding(noteId: string): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.run('DELETE FROM vec_notes WHERE note_id = ?', [noteId])
}

/**
 * KNN 向量搜索：返回最接近查询向量的 noteId 及距离
 */
export function searchByVector(
  queryVector: Float32Array,
  limit: number = 30,
): { noteId: string, distance: number }[] {
  if (!isVecAvailable())
    return []

  const sqlite = getSqlite()

  const stmt = sqlite.prepare(`
    SELECT note_id, distance
    FROM vec_notes
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `)

  const results = stmt.all(
    new Uint8Array(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength),
    limit,
  ) as { note_id: string, distance: number }[]

  return results.map(r => ({
    noteId: r.note_id,
    distance: r.distance,
  }))
}

/**
 * 获取已索引的 embedding 数量
 */
export function getEmbeddingCount(): number {
  if (!isVecAvailable())
    return 0

  const sqlite = getSqlite()
  const result = sqlite.prepare('SELECT count(*) as cnt FROM vec_notes').get() as { cnt: number }
  return result?.cnt ?? 0
}

/**
 * 检查某个笔记是否已有 embedding
 */
export function hasNoteEmbedding(noteId: string): boolean {
  if (!isVecAvailable())
    return false

  const sqlite = getSqlite()
  const result = sqlite.prepare(
    'SELECT 1 FROM vec_notes WHERE note_id = ? LIMIT 1',
  ).get(noteId) as Record<string, unknown> | null
  return result !== null
}

/**
 * 清空所有 embedding（重新索引前调用）
 */
export function clearAllEmbeddings(): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.run('DELETE FROM vec_notes')
}

export { EMBEDDING_DIM, isVecAvailable }
