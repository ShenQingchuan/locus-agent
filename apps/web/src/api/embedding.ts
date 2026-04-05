import { apiClient } from './client.js'

const API_BASE = '/api/embedding'

// ==================== Types ====================

export type EmbeddingStatusType
  = | 'not_configured'
    | 'indexing'
    | 'ready'
    | 'error'

export type EmbeddingProvider = 'zhipu' | 'local'
export type EmbeddingLocalFamily = 'qwen' | 'bge'

export interface EmbeddingSelection {
  provider: EmbeddingProvider
  label: string
  modelId: string
  source: string
  dimensions: number
  localFamily: EmbeddingLocalFamily | null
}

export interface EmbeddingStatus {
  status: EmbeddingStatusType
  error?: string
  indexedCount: number
  /** Which model built the current index (null = never indexed) */
  indexedWith: EmbeddingSelection | null
  vecAvailable: boolean
  embeddingConfigured: boolean
  provider: EmbeddingProvider
  localFamily: EmbeddingLocalFamily
  localModelLabel: string
  localModelId: string
  localModelSource: string
  localModelReady: boolean
  localModelFiles: { name: string, size: number }[]
  localRuntimeInstalled: boolean
}

export interface EmbeddingProgressEvent {
  status: string
  indexedCount?: number
  totalCount?: number
  percent?: number
  message?: string
}

export interface ModelFileProgress {
  file: string
  status: 'initiate' | 'download' | 'progress' | 'done'
  progress?: number
  loaded?: number
  total?: number
}

// ==================== Helpers ====================

function consumeSSE(
  url: string,
  method: 'POST' | 'GET',
  handlers: Record<string, (data: any) => void>,
): { close: () => void } {
  const controller = new AbortController()

  fetch(url, { method, signal: controller.signal }).then(async (res) => {
    if (!res.ok || !res.body) {
      handlers.error?.({ message: '请求失败' })
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      let currentEvent = ''
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim()
        }
        else if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          try {
            const parsed = JSON.parse(data)
            const handler = currentEvent ? handlers[currentEvent] : undefined
            if (handler) {
              handler(parsed)
            }
          }
          catch { /* ignore */ }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      handlers.error?.({ message: err.message || '网络错误' })
    }
  })

  return { close: () => controller.abort() }
}

// ==================== Status ====================

export function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  return apiClient.get<EmbeddingStatus>(`${API_BASE}/status`)
}

// ==================== Provider ====================

export function setEmbeddingProvider(provider: EmbeddingProvider): Promise<EmbeddingStatus & { success: boolean }> {
  return apiClient.post<EmbeddingStatus & { success: boolean }>(`${API_BASE}/provider`, { provider })
}

export function setLocalEmbeddingFamily(family: EmbeddingLocalFamily): Promise<EmbeddingStatus & { success: boolean }> {
  return apiClient.post<EmbeddingStatus & { success: boolean }>(`${API_BASE}/local-family`, { family })
}

// ==================== Model management ====================

export function fetchModelStatus(): Promise<{
  ready: boolean
  downloading: boolean
  files: { name: string, size: number }[]
}> {
  return apiClient.get(`${API_BASE}/model/status`)
}

export function startModelDownload(
  onFileProgress: (data: ModelFileProgress) => void,
  onComplete: (data: { ready: boolean, files: { name: string, size: number }[] }) => void,
  onError: (msg: string) => void,
): { close: () => void } {
  return consumeSSE(`${API_BASE}/model/download`, 'POST', {
    'file-progress': onFileProgress,
    'complete': onComplete,
    'error': (data: { message: string }) => onError(data.message || '下载失败'),
  })
}

export function deleteModel(): Promise<{ success: boolean }> {
  return apiClient.del(`${API_BASE}/model`)
}

// ==================== Reindex ====================

export function startReindex(
  onProgress: (data: EmbeddingProgressEvent) => void,
  onComplete: () => void,
  onError: (msg: string) => void,
): { close: () => void } {
  return consumeSSE(`${API_BASE}/reindex`, 'POST', {
    progress: onProgress,
    complete: () => onComplete(),
    error: (data: { message?: string }) => onError(data.message || '未知错误'),
  })
}

// ==================== ONNX runtime deps ====================

export function fetchRuntimeStatus(): Promise<{ installed: boolean }> {
  return apiClient.get(`${API_BASE}/runtime/status`)
}

export function startRuntimeInstall(
  onOutput: (output: string) => void,
  onComplete: () => void,
  onError: (msg: string) => void,
): { close: () => void } {
  return consumeSSE(`${API_BASE}/runtime/install`, 'POST', {
    output: (data: { output: string }) => onOutput(data.output),
    complete: () => onComplete(),
    error: (data: { message?: string }) => onError(data.message || '安装失败'),
  })
}

export function uninstallRuntime(): Promise<{ success: boolean }> {
  return apiClient.del(`${API_BASE}/runtime`)
}

// ==================== Error ====================

export function clearEmbeddingError(): Promise<EmbeddingStatus & { success: boolean }> {
  return apiClient.post<EmbeddingStatus & { success: boolean }>(`${API_BASE}/clear-error`)
}
