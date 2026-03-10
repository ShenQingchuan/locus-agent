import type { EmbeddingProvider } from '../services/embedding.js'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/index.js'
import { notes } from '../db/schema.js'
import { embedBatch, getEmbeddingProvider, setEmbeddingProvider } from '../services/embedding.js'
import {
  clearTransientStatus,
  getEmbeddingStatus,
  setIndexedWith,
  setTransientStatus,
} from '../services/embeddingStatus.js'
import { installLocalDeps, isLocalDepsInstalled, uninstallLocalDeps } from '../services/localDeps.js'
import {
  deleteLocalModel,
  downloadModel,
  getLocalModelFiles,
  isLocalModelReady,
  resetPipeline,
} from '../services/localEmbedding.js'
import { clearAllEmbeddings, getEmbeddingCount, upsertNoteEmbedding } from '../services/vectorStore.js'

export const embeddingRoutes = new Hono()

let reindexing = false
let downloading = false

// ==================== Status ====================

/**
 * GET /api/embedding/status
 */
embeddingRoutes.get('/status', (c) => {
  return c.json(getEmbeddingStatus())
})

// ==================== Provider ====================

/**
 * GET /api/embedding/provider
 */
embeddingRoutes.get('/provider', (c) => {
  return c.json({ provider: getEmbeddingProvider() })
})

/**
 * POST /api/embedding/provider
 * Body: { provider: 'zhipu' | 'local' }
 */
embeddingRoutes.post('/provider', async (c) => {
  const body = await c.req.json<{ provider: EmbeddingProvider }>()
  const provider = body.provider

  if (provider !== 'zhipu' && provider !== 'local') {
    return c.json({ error: 'Invalid provider. Must be "zhipu" or "local".' }, 400)
  }

  setEmbeddingProvider(provider)
  resetPipeline()

  return c.json({ success: true, ...getEmbeddingStatus() })
})

// ==================== Model download ====================

/**
 * GET /api/embedding/model/status
 */
embeddingRoutes.get('/model/status', (c) => {
  return c.json({
    ready: isLocalModelReady(),
    downloading,
    files: getLocalModelFiles(),
  })
})

/**
 * POST /api/embedding/model/download
 * Downloads the local ONNX model (SSE progress stream)
 */
embeddingRoutes.post('/model/download', (c) => {
  if (downloading) {
    return c.json({ error: '模型正在下载中' }, 409)
  }

  return streamSSE(c, async (stream) => {
    downloading = true

    try {
      await downloadModel((data) => {
        stream.writeSSE({
          event: 'file-progress',
          data: JSON.stringify(data),
        })
      })

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({
          ready: true,
          files: getLocalModelFiles(),
        }),
      })
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message }),
      })
    }
    finally {
      downloading = false
    }
  })
})

/**
 * DELETE /api/embedding/model
 * Delete downloaded model files
 */
embeddingRoutes.delete('/model', async (c) => {
  if (downloading) {
    return c.json({ error: '模型正在下载中，无法删除' }, 409)
  }

  try {
    await deleteLocalModel()
    return c.json({ success: true })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// ==================== ONNX runtime deps ====================

let runtimeInstalling = false

embeddingRoutes.get('/runtime/status', (c) => {
  return c.json({ installed: isLocalDepsInstalled() })
})

embeddingRoutes.post('/runtime/install', (c) => {
  if (runtimeInstalling) {
    return c.json({ error: '正在安装中' }, 409)
  }

  return streamSSE(c, async (stream) => {
    runtimeInstalling = true
    try {
      const result = await installLocalDeps((output) => {
        stream.writeSSE({ event: 'output', data: JSON.stringify({ output }) })
      })

      if (result.success) {
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({ success: true }),
        })
      }
      else {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: result.error }),
        })
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message }),
      })
    }
    finally {
      runtimeInstalling = false
    }
  })
})

embeddingRoutes.delete('/runtime', async (c) => {
  if (runtimeInstalling) {
    return c.json({ error: '正在安装中，无法卸载' }, 409)
  }
  try {
    uninstallLocalDeps()
    return c.json({ success: true })
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// ==================== Reindex ====================

/**
 * POST /api/embedding/reindex
 * Re-index all notes via the active embedding provider (SSE progress stream)
 */
embeddingRoutes.post('/reindex', (c) => {
  const status = getEmbeddingStatus()

  if (!status.vecAvailable) {
    return c.json({ error: 'sqlite-vec 扩展不可用' }, 400)
  }

  if (!status.embeddingConfigured) {
    const provider = getEmbeddingProvider()
    const msg = provider === 'local'
      ? '本地模型未下载，请先下载模型'
      : '未配置智谱 API Key，请在 LLM 设置中配置'
    return c.json({ error: msg }, 400)
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

      // Record which provider built this index
      setIndexedWith(getEmbeddingProvider())
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
