import { getSqlite, isVecAvailable } from '../../db/index.js'
import { EMBEDDING_DIM } from '../embedding/provider.js'

export { EMBEDDING_DIM, isVecAvailable }

export function upsertMemoryEmbedding(noteId: string, embedding: Float32Array): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  const upsert = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM vec_notes WHERE note_id = ?').run(noteId)
    sqlite.prepare(
      'INSERT INTO vec_notes(note_id, embedding) VALUES (?, ?)',
    ).run(noteId, new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength))
  })
  upsert()
}

export function deleteMemoryEmbedding(noteId: string): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.prepare('DELETE FROM vec_notes WHERE note_id = ?').run(noteId)
}

export function searchByVector(
  queryVector: Float32Array,
  limit: number = 30,
  candidateNoteIds?: string[],
): { noteId: string, distance: number }[] {
  if (!isVecAvailable())
    return []

  const sqlite = getSqlite()

  let sql = `
    SELECT note_id, distance
    FROM vec_notes
    WHERE embedding MATCH ?
  `
  const params: (Uint8Array | number | string)[] = [
    new Uint8Array(queryVector.buffer, queryVector.byteOffset, queryVector.byteLength),
  ]

  if (candidateNoteIds && candidateNoteIds.length > 0) {
    // Cap to stay under SQLite parameter limits (usually 999)
    const cappedIds = candidateNoteIds.slice(0, 900)
    const placeholders = cappedIds.map(() => '?').join(',')
    sql += ` AND note_id IN (${placeholders})`
    params.push(...cappedIds)
  }

  sql += ` ORDER BY distance LIMIT ?`
  params.push(limit)

  const stmt = sqlite.prepare(sql)
  const results = stmt.all(...params) as { note_id: string, distance: number }[]

  return results.map(r => ({
    noteId: r.note_id,
    distance: r.distance,
  }))
}

export function getEmbeddingCount(): number {
  if (!isVecAvailable())
    return 0

  const sqlite = getSqlite()
  const result = sqlite.prepare('SELECT count(*) as cnt FROM vec_notes').get() as { cnt: number }
  return result?.cnt ?? 0
}

export function hasMemoryEmbedding(noteId: string): boolean {
  if (!isVecAvailable())
    return false

  const sqlite = getSqlite()
  const result = sqlite.prepare(
    'SELECT 1 FROM vec_notes WHERE note_id = ? LIMIT 1',
  ).get(noteId) as Record<string, unknown> | undefined
  return result !== undefined
}

export function clearAllEmbeddings(): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.prepare('DELETE FROM vec_notes').run()
}
