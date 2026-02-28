import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/index.js'
import { notes } from '../db/schema.js'
import { embedBatch } from '../services/embedding.js'
import {
  clearTransientStatus,
  getEmbeddingStatus,
  setTransientStatus,
} from '../services/embeddingStatus.js'
import { clearAllEmbeddings, getEmbeddingCount, upsertNoteEmbedding } from '../services/vectorStore.js'

export const embeddingRoutes = new Hono()

let reindexing = false

/**
 * GET /api/embedding/status
 */
embeddingRoutes.get('/status', (c) => {
  return c.json(getEmbeddingStatus())
})

/**
 * POST /api/embedding/reindex
 * Re-index all notes via Zhipu embedding-3 API (SSE progress stream)
 */
embeddingRoutes.post('/reindex', (c) => {
  const status = getEmbeddingStatus()

  if (!status.vecAvailable) {
    return c.json({ error: 'sqlite-vec 扩展不可用' }, 400)
  }

  if (!status.embeddingConfigured) {
    return c.json({ error: '未配置智谱 API Key，请在 LLM 设置中配置' }, 400)
  }

  if (reindexing) {
    return c.json({ error: '正在索引中，请稍候' }, 409)
  }

  return streamSSE(c, async (stream) => {
    reindexing = true

    try {
      setTransientStatus('indexing')

      const allNotes = await db
        .select({ id: notes.id, content: notes.content })
        .from(notes)

      const totalCount = allNotes.length
      if (totalCount === 0) {
        clearTransientStatus()
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ status: 'ready', indexedCount: 0, totalCount: 0 }),
        })
        return
      }

      clearAllEmbeddings()

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ status: 'indexing', indexedCount: 0, totalCount }),
      })

      const texts = allNotes.map(n => n.content)
      const embeddings = await embedBatch(texts, (done, total) => {
        stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            status: 'indexing',
            indexedCount: done,
            totalCount: total,
            percent: Math.round((done / total) * 100),
          }),
        })
      })

      for (let i = 0; i < allNotes.length; i++) {
        upsertNoteEmbedding(allNotes[i].id, embeddings[i])
      }

      clearTransientStatus()

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          status: 'ready',
          indexedCount: getEmbeddingCount(),
          totalCount,
        }),
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setTransientStatus('error', message)

      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ status: 'error', message }),
      })
    }
    finally {
      reindexing = false
    }
  })
})

/**
 * POST /api/embedding/clear-error
 */
embeddingRoutes.post('/clear-error', (c) => {
  clearTransientStatus()
  return c.json({ success: true, ...getEmbeddingStatus() })
})
