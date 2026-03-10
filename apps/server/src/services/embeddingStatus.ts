import type { EmbeddingProvider } from './embedding.js'
import type { ModelFileInfo } from './localEmbedding.js'
import { isVecAvailable } from '../db/index.js'
import { getSetting, setSetting } from '../settings/index.js'
import { getEmbeddingProvider, isEmbeddingConfigured } from './embedding.js'
import { isLocalDepsInstalled } from './localDeps.js'
import { getLocalModelFiles, isLocalModelReady } from './localEmbedding.js'
import { getEmbeddingCount } from './vectorStore.js'

// ==================== Types ====================

export type EmbeddingStatusType
  = | 'not_configured'
    | 'indexing'
    | 'ready'
    | 'error'

export interface EmbeddingStatus {
  status: EmbeddingStatusType
  error?: string
  indexedCount: number
  /** Which provider was used to build the current index (null = never indexed) */
  indexedWith: EmbeddingProvider | null
  vecAvailable: boolean
  embeddingConfigured: boolean
  provider: EmbeddingProvider
  localModelReady: boolean
  localModelFiles: ModelFileInfo[]
  /** Whether ONNX runtime deps are installed in the data directory */
  localRuntimeInstalled: boolean
}

// ==================== Settings KV ====================

const KEY_TRANSIENT = 'embedding.transient_status'
const KEY_ERROR = 'embedding.error'
const KEY_INDEXED_WITH = 'embedding.indexed_with'

// ==================== Public API ====================

export function getIndexedWith(): EmbeddingProvider | null {
  const val = getSetting(KEY_INDEXED_WITH)
  if (val === 'zhipu' || val === 'local')
    return val
  return null
}

export function setIndexedWith(provider: EmbeddingProvider): void {
  setSetting(KEY_INDEXED_WITH, provider)
}

export function clearIndexedWith(): void {
  setSetting(KEY_INDEXED_WITH, '')
}

export function getEmbeddingStatus(): EmbeddingStatus {
  const vecAvailable = isVecAvailable()
  const configured = isEmbeddingConfigured()
  const provider = getEmbeddingProvider()

  const transient = getSetting(KEY_TRANSIENT) as 'indexing' | 'error' | undefined
  const error = getSetting(KEY_ERROR) || undefined

  let status: EmbeddingStatusType

  if (transient === 'indexing') {
    status = 'indexing'
  }
  else if (transient === 'error') {
    status = 'error'
  }
  else if (configured && vecAvailable) {
    status = 'ready'
  }
  else {
    status = 'not_configured'
  }

  const indexedCount = vecAvailable ? getEmbeddingCount() : 0

  return {
    status,
    error: status === 'error' ? error : undefined,
    indexedCount,
    indexedWith: indexedCount > 0 ? getIndexedWith() : null,
    vecAvailable,
    embeddingConfigured: configured,
    provider,
    localModelReady: isLocalModelReady(),
    localModelFiles: getLocalModelFiles(),
    localRuntimeInstalled: isLocalDepsInstalled(),
  }
}

export function setTransientStatus(status: 'indexing' | 'error', error?: string): void {
  setSetting(KEY_TRANSIENT, status)
  if (error) {
    setSetting(KEY_ERROR, error)
  }
  else {
    setSetting(KEY_ERROR, '')
  }
}

export function clearTransientStatus(): void {
  setSetting(KEY_TRANSIENT, '')
  setSetting(KEY_ERROR, '')
}
