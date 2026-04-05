export interface ApiError {
  code: string
  message: string
}

export class ApiRequestError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(
  method: string,
  url: string,
  body?: unknown,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: options?.signal,
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  const response = await fetch(url, init)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as Partial<ApiError>
    throw new ApiRequestError(
      errorData.code || 'HTTP_ERROR',
      errorData.message || `HTTP error: ${response.status}`,
    )
  }
  return response.json() as Promise<T>
}

export const apiClient = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown, options?: { signal?: AbortSignal }) => request<T>('POST', url, body, options),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
}
