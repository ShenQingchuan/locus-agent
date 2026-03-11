import type {
  EmbeddingLocalFamily,
  EmbeddingProvider,
  EmbeddingSelection,
} from './embedding.js'
import type { ModelFileInfo } from './localEmbedding.js'
import { isVecAvailable } from '../db/index.js'
import { getSetting, setSetting } from '../settings/index.js'
import {
  getActiveEmbeddingSelection,
  getEmbeddingProvider,
  getLocalEmbeddingModelFamily,
  isEmbeddingConfigured,
} from './embedding.js'
import { isLocalDepsInstalled } from './localDeps.js'
import { getLocalEmbeddingModel, getLocalModelFiles, isLocalModelReady } from './localEmbedding.js'
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
  /** Which model was used to build the current index (null = never indexed) */
  indexedWith: EmbeddingSelection | null
  vecAvailable: boolean
  embeddingConfigured: boolean
  provider: EmbeddingProvider
  localFamily: EmbeddingLocalFamily
  localModelLabel: string
  localModelId: string
  localModelSource: string
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

function getLegacyIndexedWith(provider: EmbeddingProvider): EmbeddingSelection {
  return getActiveEmbeddingSelection(provider)
}

export function getIndexedWith(): EmbeddingSelection | null {
  const val = getSetting(KEY_INDEXED_WITH)
  if (!val)
    return null

  try {
    const parsed = JSON.parse(val) as Partial<EmbeddingSelection>
    if (parsed.provider === 'zhipu' || parsed.provider === 'local') {
      return {
        provider: parsed.provider,
        label: parsed.label || parsed.modelId || parsed.provider,
        modelId: parsed.modelId || parsed.provider,
        source: parsed.source || '',
        dimensions: typeof parsed.dimensions === 'number' ? parsed.dimensions : 1024,
        localFamily: parsed.provider === 'local' && (parsed.localFamily === 'qwen' || parsed.localFamily === 'bge')
          ? parsed.localFamily
          : null,
      }
    }
  }
  catch {
    if (val === 'zhipu' || val === 'local')
      return getLegacyIndexedWith(val)
  }

  return null
}

export function setIndexedWith(selection: EmbeddingSelection): void {
  setSetting(KEY_INDEXED_WITH, JSON.stringify(selection))
}

export function clearIndexedWith(): void {
  setSetting(KEY_INDEXED_WITH, '')
}

export function getEmbeddingStatus(): EmbeddingStatus {
  const vecAvailable = isVecAvailable()
  const configured = isEmbeddingConfigured()
  const provider = getEmbeddingProvider()
  const localFamily = getLocalEmbeddingModelFamily()
  const localModel = getLocalEmbeddingModel()

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
    localFamily,
    localModelLabel: localModel.label,
    localModelId: localModel.modelId,
    localModelSource: localModel.source,
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
