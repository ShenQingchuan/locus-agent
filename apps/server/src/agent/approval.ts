/**
 * 工具执行审批管理
 * 用于确认模式下管理待确认的工具调用
 */

export interface PendingApproval {
  resolve: (approved: boolean) => void
  toolCallId: string
  toolName: string
  args: unknown
}

/**
 * 存储待确认的工具调用
 * key: toolCallId
 */
const pendingApprovals = new Map<string, PendingApproval>()

/**
 * 请求用户确认工具执行
 * 返回一个 Promise，当用户确认或拒绝时 resolve
 * @param toolCallId 工具调用 ID
 * @param toolName 工具名称
 * @param args 工具参数
 * @returns Promise<boolean> - true 表示批准，false 表示拒绝
 */
export function requestApproval(
  toolCallId: string,
  toolName: string,
  args: unknown,
): Promise<boolean> {
  return new Promise((resolve) => {
    pendingApprovals.set(toolCallId, {
      resolve,
      toolCallId,
      toolName,
      args,
    })
  })
}

/**
 * 处理用户的确认/拒绝响应
 * @param toolCallId 工具调用 ID
 * @param approved 是否批准
 * @returns boolean - 是否找到并处理了对应的待确认请求
 */
export function resolveApproval(toolCallId: string, approved: boolean): boolean {
  const pending = pendingApprovals.get(toolCallId)
  if (!pending) {
    return false
  }

  pending.resolve(approved)
  pendingApprovals.delete(toolCallId)
  return true
}

/**
 * 检查是否有待确认的工具调用
 * @param toolCallId 工具调用 ID
 * @returns boolean - 是否存在待确认的请求
 */
export function hasPendingApproval(toolCallId: string): boolean {
  return pendingApprovals.has(toolCallId)
}

/**
 * 获取所有待确认的工具调用
 * @returns 待确认的工具调用列表
 */
export function getPendingApprovals(): PendingApproval[] {
  return Array.from(pendingApprovals.values())
}

/**
 * 获取指定 toolCallId 的待确认请求（不删除）
 * @param toolCallId 工具调用 ID
 * @returns 待确认请求，或 undefined
 */
export function getPendingApproval(toolCallId: string): PendingApproval | undefined {
  return pendingApprovals.get(toolCallId)
}

/**
 * 清除指定 toolCallId 的待确认请求（用于超时或取消场景）
 * @param toolCallId 工具调用 ID
 */
export function clearPendingApproval(toolCallId: string): void {
  const pending = pendingApprovals.get(toolCallId)
  if (pending) {
    pending.resolve(false) // 默认拒绝
    pendingApprovals.delete(toolCallId)
  }
}

/**
 * 清除所有待确认请求
 */
export function clearAllPendingApprovals(): void {
  for (const pending of pendingApprovals.values()) {
    pending.resolve(false) // 默认拒绝
  }
  pendingApprovals.clear()
}
