import { getSqlite } from '../../db/index.js'
import { upsertMemoryEmbedding } from '../store/vectorDb.js'
import { getCachedEmbedding, setCachedEmbedding } from './cache.js'
import { embedBatch, isEmbeddingConfigured } from './provider.js'

interface QueueItem {
  noteId: string
  content: string
  tagNames: string[]
  attempts: number
}

const pendingQueue: QueueItem[] = []
let workerInterval: ReturnType<typeof setInterval> | null = null
const MAX_RETRIES = 3
const BATCH_SIZE = 8

export function buildEmbeddingText(content: string, tagNames: string[]): string {
  if (tagNames.length === 0)
    return content
  return `${tagNames.join(' ')}\n${content}`
}

async function processBatch(items: QueueItem[]): Promise<void> {
  if (!isEmbeddingConfigured())
    return

  const texts: string[] = []
  const validItems: QueueItem[] = []

  for (const item of items) {
    const text = buildEmbeddingText(item.content, item.tagNames)
    const cached = getCachedEmbedding(text)
    if (cached) {
      upsertMemoryEmbedding(item.noteId, cached)
      continue
    }
    texts.push(text)
    validItems.push(item)
  }

  if (validItems.length === 0)
    return

  try {
    const vectors = await embedBatch(texts)
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i]
      const vector = vectors[i]
      setCachedEmbedding(texts[i], vector)
      upsertMemoryEmbedding(item.noteId, vector)
    }
  }
  catch (err) {
    // Retry individual items on next tick
    for (const item of validItems) {
      item.attempts++
      if (item.attempts < MAX_RETRIES) {
        pendingQueue.push(item)
      }
      else {
        console.warn('[embedding-queue] Failed to embed note after retries:', item.noteId, err)
      }
    }
  }
}

function ensureWorker(): void {
  if (workerInterval)
    return
  workerInterval = setInterval(() => {
    if (pendingQueue.length === 0)
      return
    const batch = pendingQueue.splice(0, BATCH_SIZE)
    void processBatch(batch)
  }, 5000)
}

/**
 * Enqueue a note for background embedding indexing.
 * Replaces the old fire-and-forget pattern with retries.
 */
export function enqueueEmbedding(noteId: string, content: string, tagNames: string[]): void {
  pendingQueue.push({ noteId, content, tagNames, attempts: 0 })
  ensureWorker()
}

/**
 * Enqueue a note embedding deletion.
 */
export function enqueueEmbeddingDeletion(noteId: string): void {
  const sqlite = getSqlite()
  try {
    sqlite.run('DELETE FROM vec_notes WHERE note_id = ?', [noteId])
  }
  catch {
    // ignore
  }
}

/**
 * Stop the background worker. Useful for graceful shutdown.
 */
export function stopEmbeddingWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval)
    workerInterval = null
  }
}
