import { getSqlite, isVecAvailable } from '../../db/index.js'
import { EMBEDDING_DIM } from '../embedding/provider.js'

export { EMBEDDING_DIM, isVecAvailable }

export function upsertMemoryEmbedding(noteId: string, embedding: Float32Array): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.transaction(() => {
    sqlite.run('DELETE FROM vec_notes WHERE note_id = ?', [noteId])
    sqlite.run(
      'INSERT INTO vec_notes(note_id, embedding) VALUES (?, ?)',
      [noteId, new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength)],
    )
  })()
}

export function deleteMemoryEmbedding(noteId: string): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.run('DELETE FROM vec_notes WHERE note_id = ?', [noteId])
}

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
  ).get(noteId) as Record<string, unknown> | null
  return result !== null
}

export function clearAllEmbeddings(): void {
  if (!isVecAvailable())
    return

  const sqlite = getSqlite()
  sqlite.run('DELETE FROM vec_notes')
}
