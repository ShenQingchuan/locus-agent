import { createPendingRequestStore } from './pending-request-store.js'

export interface PendingApproval {
  resolve: (approved: boolean) => void
  toolCallId: string
  conversationId: string
  toolName: string
  args: unknown
}

const approvalStore = createPendingRequestStore<{ conversationId: string, toolName: string, args: unknown }, boolean>({
  defaultResolveValue: false,
})

function toPendingApproval(
  entry: ReturnType<typeof approvalStore.getAll>[number],
): PendingApproval {
  return {
    resolve: entry.resolve,
    toolCallId: entry.requestId,
    conversationId: entry.payload.conversationId,
    toolName: entry.payload.toolName,
    args: entry.payload.args,
  }
}

export function requestApproval(
  conversationId: string,
  toolCallId: string,
  toolName: string,
  args: unknown,
): Promise<boolean> {
  return approvalStore.request(toolCallId, { conversationId, toolName, args })
}

export function resolveApproval(toolCallId: string, approved: boolean): boolean {
  return approvalStore.resolve(toolCallId, approved)
}

export function hasPendingApproval(toolCallId: string): boolean {
  return approvalStore.has(toolCallId)
}

export function getPendingApprovals(): PendingApproval[] {
  return approvalStore.getAll().map(toPendingApproval)
}

export function getPendingApproval(toolCallId: string): PendingApproval | undefined {
  const pending = approvalStore.get(toolCallId)
  return pending ? toPendingApproval(pending) : undefined
}

export function clearPendingApproval(toolCallId: string): void {
  approvalStore.clear(toolCallId)
}

export function clearAllPendingApprovals(): void {
  approvalStore.clearAll()
}

export function resolvePendingApprovalsForConversation(
  conversationId: string,
  approved: boolean,
  excludeToolCallId?: string,
): number {
  const pendingApprovals = approvalStore.getAll()
  let resolvedCount = 0

  for (const approval of pendingApprovals) {
    if (approval.payload.conversationId !== conversationId)
      continue
    if (approval.requestId === excludeToolCallId)
      continue

    if (approvalStore.resolve(approval.requestId, approved))
      resolvedCount += 1
  }

  return resolvedCount
}
