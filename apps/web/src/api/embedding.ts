const API_BASE = '/api/embedding'

// ==================== Types ====================

export type EmbeddingStatusType
  = | 'not_downloaded'
    | 'downloading'
    | 'indexing'
    | 'ready'
    | 'error'

export interface EmbeddingStatus {
  status: EmbeddingStatusType
  error?: string
  indexedCount: number
  vecAvailable: boolean
  embeddingModelCached: boolean
  embeddingModelLoaded: boolean
}

export interface FileProgressItem {
  name: string
  loaded: number
  total: number
  percent: number
}

export interface EmbeddingProgressEvent {
  status: string
  file?: string
  loaded?: number
  total?: number
  percent?: number
  files?: FileProgressItem[]
  indexedCount?: number
  totalCount?: number
  message?: string
}

// ==================== API ====================

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

/**
 * 获取 embedding 状态
 */
export function fetchEmbeddingStatus(): Promise<EmbeddingStatus> {
  return request<EmbeddingStatus>('/status')
}

/**
 * 开始下载模型（返回 SSE EventSource）
 */
export function startModelDownload(
  onProgress: (data: EmbeddingProgressEvent) => void,
  onComplete: () => void,
  onError: (msg: string) => void,
): { close: () => void } {
  const controller = new AbortController()

  fetch(`${API_BASE}/download`, {
    method: 'POST',
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError('下载请求失败')
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

      // 解析 SSE 事件
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
            const parsed = JSON.parse(data) as EmbeddingProgressEvent

            if (currentEvent === 'progress') {
              onProgress(parsed)
            }
            else if (currentEvent === 'complete') {
              onComplete()
            }
            else if (currentEvent === 'error') {
              onError(parsed.message || '未知错误')
            }
            else if (currentEvent === 'cancelled') {
              onError('下载已取消')
            }
          }
          catch {
            // ignore parse errors
          }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err.message || '网络错误')
    }
  })

  return {
    close: () => controller.abort(),
  }
}

/**
 * 取消下载
 */
export function cancelModelDownload(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/cancel-download', { method: 'POST' })
}

/**
 * 开始重新索引（返回 SSE 流控制器）
 */
export function startReindex(
  onProgress: (data: EmbeddingProgressEvent) => void,
  onComplete: () => void,
  onError: (msg: string) => void,
): { close: () => void } {
  const controller = new AbortController()

  fetch(`${API_BASE}/reindex`, {
    method: 'POST',
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError('重新索引请求失败')
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
            const parsed = JSON.parse(data) as EmbeddingProgressEvent

            if (currentEvent === 'progress') {
              onProgress(parsed)
            }
            else if (currentEvent === 'complete') {
              onComplete()
            }
            else if (currentEvent === 'error') {
              onError(parsed.message || '未知错误')
            }
          }
          catch {
            // ignore
          }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err.message || '网络错误')
    }
  })

  return {
    close: () => controller.abort(),
  }
}

/**
 * 清除错误状态
 */
export function clearEmbeddingError(): Promise<EmbeddingStatus & { success: boolean }> {
  return request<EmbeddingStatus & { success: boolean }>('/clear-error', { method: 'POST' })
}

/**
 * 删除模型和所有 embedding
 */
export function deleteEmbeddingModel(): Promise<{ success: boolean, status: string }> {
  return request<{ success: boolean, status: string }>('', { method: 'DELETE' })
}
