import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { db } from '../db/index.js'
import { notes } from '../db/schema.js'
import { deleteModelCache, embedBatch, ensureModelLoaded, loadModel, unloadModel } from '../services/embedding.js'
import {
  clearTransientStatus,
  getEmbeddingStatus,
  setTransientStatus,
} from '../services/embeddingStatus.js'
import { clearAllEmbeddings, getEmbeddingCount, upsertNoteEmbedding } from '../services/vectorStore.js'

export const embeddingRoutes = new Hono()

// 下载取消控制器
let downloadAbortController: AbortController | null = null

// 防止重复索引
let reindexing = false

/**
 * GET /api/embedding/status
 * 实时状态：基于磁盘文件 + 内存状态推导，KV 只保留 downloading/indexing/error 瞬态
 */
embeddingRoutes.get('/status', (c) => {
  return c.json(getEmbeddingStatus())
})

/**
 * POST /api/embedding/download
 * 下载 embedding 模型（SSE 流式进度）
 */
embeddingRoutes.post('/download', (c) => {
  const status = getEmbeddingStatus()

  if (!status.vecAvailable) {
    return c.json(
      { error: 'sqlite-vec 扩展不可用，无法使用语义搜索' },
      400,
    )
  }

  if (status.embeddingModelLoaded) {
    return c.json(
      { error: '模型已下载并加载' },
      400,
    )
  }

  return streamSSE(c, async (stream) => {
    downloadAbortController = new AbortController()

    try {
      setTransientStatus('downloading')

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ status: 'downloading', percent: 0, files: [] }),
      })

      // 聚合多文件下载进度
      const fileProgress = new Map<string, { loaded: number, total: number }>()
      let lastSentTime = 0
      const THROTTLE_MS = 300

      await loadModel((progress) => {
        if (downloadAbortController?.signal.aborted)
          return

        const file = progress.file || progress.name || ''

        // 更新单文件进度
        if (progress.total != null && progress.total > 0) {
          fileProgress.set(file, {
            loaded: progress.loaded ?? 0,
            total: progress.total,
          })
        }

        // 计算总进度
        let totalBytes = 0
        let loadedBytes = 0
        for (const fp of fileProgress.values()) {
          totalBytes += fp.total
          loadedBytes += fp.loaded
        }

        const percent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0

        // 节流
        const now = Date.now()
        if (now - lastSentTime < THROTTLE_MS && percent < 100)
          return
        lastSentTime = now

        // 构建每个文件的独立进度
        const files = Array.from(fileProgress.entries()).map(([name, fp]) => ({
          name,
          loaded: fp.loaded,
          total: fp.total,
          percent: fp.total > 0 ? Math.round((fp.loaded / fp.total) * 100) : 0,
        }))

        stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            status: 'downloading',
            file,
            loaded: loadedBytes,
            total: totalBytes,
            percent,
            files,
          }),
        })
      })

      if (downloadAbortController?.signal.aborted) {
        clearTransientStatus()
        await stream.writeSSE({
          event: 'cancelled',
          data: JSON.stringify({ status: 'not_downloaded' }),
        })
        return
      }

      // 下载完成，清除瞬态标记（status 会自动推导为 ready）
      clearTransientStatus()

      await stream.writeSSE({
        event: 'complete',
        data: JSON.stringify({ status: 'ready' }),
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
      downloadAbortController = null
    }
  })
})

/**
 * POST /api/embedding/cancel-download
 * 取消正在进行的下载
 */
embeddingRoutes.post('/cancel-download', (c) => {
  if (downloadAbortController) {
    downloadAbortController.abort()
    downloadAbortController = null
    clearTransientStatus()
    return c.json({ success: true })
  }
  return c.json({ error: '没有正在进行的下载' }, 400)
})

/**
 * POST /api/embedding/reindex
 * 重新索引所有笔记（SSE 流式进度）
 */
embeddingRoutes.post('/reindex', (c) => {
  const status = getEmbeddingStatus()

  if (!status.vecAvailable) {
    return c.json({ error: 'sqlite-vec 扩展不可用' }, 400)
  }

  if (!status.embeddingModelLoaded && !status.embeddingModelCached) {
    return c.json({ error: '模型未下载，请先下载模型' }, 400)
  }

  if (reindexing) {
    return c.json({ error: '正在索引中，请稍候' }, 409)
  }

  return streamSSE(c, async (stream) => {
    reindexing = true

    try {
      // 如果模型已缓存但未加载到内存（如服务器重启后），自动加载
      if (!status.embeddingModelLoaded) {
        const loaded = await ensureModelLoaded()
        if (!loaded) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ status: 'error', message: '模型加载失败' }),
          })
          return
        }
      }

      setTransientStatus('indexing')

      // 获取所有笔记
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

      // 清空旧索引
      clearAllEmbeddings()

      await stream.writeSSE({
        event: 'progress',
        data: JSON.stringify({ status: 'indexing', indexedCount: 0, totalCount }),
      })

      // 批量嵌入
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

      // 写入向量数据库
      for (let i = 0; i < allNotes.length; i++) {
        upsertNoteEmbedding(allNotes[i].id, embeddings[i])
      }

      // 索引完成
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
 * 清除错误状态，让前端可以恢复操作
 */
embeddingRoutes.post('/clear-error', (c) => {
  clearTransientStatus()
  return c.json({ success: true, ...getEmbeddingStatus() })
})

/**
 * DELETE /api/embedding
 * 删除模型 + 清空向量索引 + 清除状态
 */
embeddingRoutes.delete('/', async (c) => {
  try {
    // 卸载内存中的模型
    await unloadModel()

    // 删除磁盘上的模型缓存
    await deleteModelCache()

    // 清空向量索引
    clearAllEmbeddings()

    // 清除所有瞬态标记
    clearTransientStatus()

    return c.json({ success: true, status: 'not_downloaded' })
  }
  catch (err) {
    return c.json(
      {
        error: '删除失败',
        message: err instanceof Error ? err.message : 'Unknown error',
      },
      500,
    )
  }
})
