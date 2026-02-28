import { isVecAvailable } from '../db/index.js'
import { getSetting, setSetting } from '../settings/index.js'
import { isEmbeddingConfigured } from './embedding.js'
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
  vecAvailable: boolean
  embeddingConfigured: boolean
}

// ==================== Settings KV ====================
// KV only persists transient states: indexing / error
// not_configured and ready are derived from runtime checks

const KEY_TRANSIENT = 'embedding.transient_status'
const KEY_ERROR = 'embedding.error'

// ==================== Public API ====================

/**
 * Derive the current embedding status from runtime state and KV.
 *
 * Priority:
 * 1. KV has indexing → use it (operation in progress)
 * 2. KV has error → use it
 * 3. Otherwise derive ready / not_configured from config checks
 */
export function getEmbeddingStatus(): EmbeddingStatus {
  const vecAvailable = isVecAvailable()
  const configured = isEmbeddingConfigured()

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

  return {
    status,
    error: status === 'error' ? error : undefined,
    indexedCount: vecAvailable ? getEmbeddingCount() : 0,
    vecAvailable,
    embeddingConfigured: configured,
  }
}

/**
 * Mark a transient operation (indexing / error)
 */
export function setTransientStatus(status: 'indexing' | 'error', error?: string): void {
  setSetting(KEY_TRANSIENT, status)
  if (error) {
    setSetting(KEY_ERROR, error)
  }
  else {
    setSetting(KEY_ERROR, '')
  }
}

/**
 * Clear transient markers (call after operation completes, status auto-derives)
 */
export function clearTransientStatus(): void {
  setSetting(KEY_TRANSIENT, '')
  setSetting(KEY_ERROR, '')
}
