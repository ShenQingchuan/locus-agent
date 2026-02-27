export interface PendingRequestEntry<TPayload, TResult> {
  requestId: string
  payload: TPayload
  resolve: (result: TResult) => void
}

interface CreatePendingRequestStoreOptions<TResult> {
  defaultResolveValue: TResult
}

export function createPendingRequestStore<TPayload, TResult>(
  options: CreatePendingRequestStoreOptions<TResult>,
) {
  const pending = new Map<string, PendingRequestEntry<TPayload, TResult>>()

  function request(requestId: string, payload: TPayload): Promise<TResult> {
    return new Promise((resolve) => {
      pending.set(requestId, {
        requestId,
        payload,
        resolve,
      })
    })
  }

  function resolve(requestId: string, result: TResult): boolean {
    const item = pending.get(requestId)
    if (!item) {
      return false
    }
    item.resolve(result)
    pending.delete(requestId)
    return true
  }

  function has(requestId: string): boolean {
    return pending.has(requestId)
  }

  function get(requestId: string): PendingRequestEntry<TPayload, TResult> | undefined {
    return pending.get(requestId)
  }

  function getAll(): PendingRequestEntry<TPayload, TResult>[] {
    return Array.from(pending.values())
  }

  function clear(requestId: string): void {
    const item = pending.get(requestId)
    if (!item) {
      return
    }
    item.resolve(options.defaultResolveValue)
    pending.delete(requestId)
  }

  function clearAll(): void {
    for (const item of pending.values()) {
      item.resolve(options.defaultResolveValue)
    }
    pending.clear()
  }

  return {
    request,
    resolve,
    has,
    get,
    getAll,
    clear,
    clearAll,
  }
}
