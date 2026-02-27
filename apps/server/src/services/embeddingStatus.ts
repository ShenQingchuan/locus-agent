import { isVecAvailable } from '../db/index.js'
import { getSetting, setSetting } from '../settings/index.js'
import { isModelCached, isModelLoaded } from './embedding.js'
import { getEmbeddingCount } from './vectorStore.js'

// ==================== Types ====================

export type EmbeddingStatusType
  = | 'not_downloaded'
    | 'downloading'
    | 'indexing'
    | 'ready'
    | 'error'

export interface EmbeddingStatus {
  status: EmbeddingStatusType
  /** 错误信息 */
  error?: string
  /** 已索引的笔记数 */
  indexedCount: number
  /** sqlite-vec 是否可用 */
  vecAvailable: boolean
  /** 模型文件是否在磁盘上 */
  embeddingModelCached: boolean
  /** 模型是否已加载到内存 */
  embeddingModelLoaded: boolean
}

// ==================== Settings KV ====================
// KV 只持久化瞬态：downloading / indexing / error
// not_downloaded 和 ready 由磁盘文件检测推导，不持久化

const KEY_TRANSIENT = 'embedding.transient_status'
const KEY_ERROR = 'embedding.error'

// ==================== Public API ====================

/**
 * 获取当前 embedding 真实状态
 *
 * 优先级：
 * 1. 如果 KV 中有 downloading / indexing → 使用（进行中操作）
 * 2. 如果 KV 中有 error → 使用
 * 3. 否则，根据磁盘文件是否存在推导 ready / not_downloaded
 */
export function getEmbeddingStatus(): EmbeddingStatus {
  const vecAvailable = isVecAvailable()
  const modelCached = isModelCached()
  const modelLoaded = isModelLoaded()

  const transient = getSetting(KEY_TRANSIENT) as 'downloading' | 'indexing' | 'error' | undefined
  const error = getSetting(KEY_ERROR) || undefined

  let status: EmbeddingStatusType

  if (transient === 'downloading' || transient === 'indexing') {
    // 进行中的操作
    status = transient
  }
  else if (transient === 'error') {
    status = 'error'
  }
  else if (modelCached || modelLoaded) {
    status = 'ready'
  }
  else {
    status = 'not_downloaded'
  }

  return {
    status,
    error: status === 'error' ? error : undefined,
    indexedCount: vecAvailable ? getEmbeddingCount() : 0,
    vecAvailable,
    embeddingModelCached: modelCached,
    embeddingModelLoaded: modelLoaded,
  }
}

/**
 * 标记瞬态操作开始（downloading / indexing）
 */
export function setTransientStatus(status: 'downloading' | 'indexing' | 'error', error?: string): void {
  setSetting(KEY_TRANSIENT, status)
  if (error) {
    setSetting(KEY_ERROR, error)
  }
  else {
    setSetting(KEY_ERROR, '')
  }
}

/**
 * 清除瞬态标记（操作完成后调用，状态会自动从磁盘检测推导）
 */
export function clearTransientStatus(): void {
  setSetting(KEY_TRANSIENT, '')
  setSetting(KEY_ERROR, '')
}
