const API_BASE = '/api/embedding'

// ==================== Types ====================

export type EmbeddingStatusType
  = | 'not_configured'
    | 'indexing'
    | 'ready'
    | 'error'

export type EmbeddingProvider = 'zhipu' | 'local'

export interface EmbeddingStatus {
  status: EmbeddingStatusType
  error?: string
  indexedCount: number
  /** Which provider built the current index (null = never indexed) */
  indexedWith: EmbeddingProvider | null
  vecAvailable: boolean
  embeddingConfigured: boolean
  provider: EmbeddingProvider
  localModelReady: boolean
  localModelFiles: { name: string, size: number }[]
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || body.message || `Request failed: ${res.status}`)
  }
  return res.json()
}

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
  return request<EmbeddingStatus>('/status')
}

// ==================== Provider ====================

export function setEmbeddingProvider(provider: EmbeddingProvider): Promise<EmbeddingStatus & { success: boolean }> {
  return request<EmbeddingStatus & { success: boolean }>('/provider', {
    method: 'POST',
    body: JSON.stringify({ provider }),
  })
}

// ==================== Model management ====================

export function fetchModelStatus(): Promise<{
  ready: boolean
  downloading: boolean
  files: { name: string, size: number }[]
}> {
  return request('/model/status')
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
  return request('/model', { method: 'DELETE' })
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

// ==================== Error ====================

export function clearEmbeddingError(): Promise<EmbeddingStatus & { success: boolean }> {
  return request<EmbeddingStatus & { success: boolean }>('/clear-error', { method: 'POST' })
}
