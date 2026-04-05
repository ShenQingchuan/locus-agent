/**
 * 活跃的 AbortController 映射
 * key: conversationId
 *
 * 清理策略（防止内存泄漏）：
 * 1. 流正常完成/异常：finally 块调用 cleanupSession()
 * 2. 客户端中止：/abort 端点调用 cleanupSession()
 * 3. 超时清理：后台任务定期清理超时会话
 */
const activeAbortControllers = new Map<string, AbortController>()

/**
 * 活跃会话的可变 confirmMode 状态
 * key: conversationId, value: 可变引用，可由 approve 端点或 conversation 更新实时变更
 *
 * 清理策略：同 activeAbortControllers
 */
const activeConfirmModes = new Map<string, { value: boolean }>()

/**
 * 活跃会话的创建时间戳（用于超时检测）
 * key: conversationId, value: 创建时间戳（ms）
 */
const activeSessionTimestamps = new Map<string, number>()

/**
 * 清理超时会话的间隔和超时时间
 */
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000 // 每 5 分钟检查一次
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 分钟未活动则清理

let sessionCleanupIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * 清理指定会话的所有活跃状态
 * 安全地处理已中止的控制器
 */
export function cleanupSession(conversationId: string): void {
  const controller = activeAbortControllers.get(conversationId)
  if (controller) {
    try {
      controller.abort()
    }
    catch {
      // 忽略已中止的控制器错误
    }
  }
  activeAbortControllers.delete(conversationId)
  activeConfirmModes.delete(conversationId)
  activeSessionTimestamps.delete(conversationId)
}

/**
 * 后台清理任务：定期清理超时的会话
 */
export function startSessionCleanupTask(): ReturnType<typeof setInterval> {
  sessionCleanupIntervalId = setInterval(() => {
    const now = Date.now()
    const expired: string[] = []

    for (const [conversationId, timestamp] of activeSessionTimestamps.entries()) {
      if (now - timestamp > SESSION_TIMEOUT) {
        expired.push(conversationId)
      }
    }

    for (const conversationId of expired) {
      cleanupSession(conversationId)
    }
  }, SESSION_CLEANUP_INTERVAL)
  return sessionCleanupIntervalId
}

/**
 * 停止后台清理任务
 */
export function stopSessionCleanupTask(): void {
  if (sessionCleanupIntervalId) {
    clearInterval(sessionCleanupIntervalId)
    sessionCleanupIntervalId = null
  }
}

/**
 * 更新活跃会话的 confirmMode（供外部路由调用）
 */
export function updateActiveConfirmMode(conversationId: string, confirmMode: boolean): void {
  const state = activeConfirmModes.get(conversationId)
  if (state) {
    state.value = confirmMode
  }
}

/**
 * 获取活跃会话的 confirmMode 可变引用（供 approval 路由直接修改）
 */
export function getActiveConfirmModeState(conversationId: string): { value: boolean } | undefined {
  return activeConfirmModes.get(conversationId)
}

/**
 * 中止指定会话的活跃流并清理状态
 * @returns 是否成功中止（false 表示没有活跃的流）
 */
export function abortSession(conversationId: string): boolean {
  const controller = activeAbortControllers.get(conversationId)
  if (controller) {
    try {
      controller.abort()
    }
    catch {
      // 忽略已中止的控制器错误
    }
    cleanupSession(conversationId)
    return true
  }
  return false
}

export function setAbortController(conversationId: string, controller: AbortController): void {
  activeAbortControllers.set(conversationId, controller)
}

export function setConfirmModeState(conversationId: string, state: { value: boolean }): void {
  activeConfirmModes.set(conversationId, state)
}

export function setSessionTimestamp(conversationId: string, timestamp: number): void {
  activeSessionTimestamps.set(conversationId, timestamp)
}

export function hasAbortController(conversationId: string): boolean {
  return activeAbortControllers.has(conversationId)
}
