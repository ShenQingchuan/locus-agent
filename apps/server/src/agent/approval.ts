import { createPendingRequestStore } from './pending-request-store.js'

export interface PendingApproval {
  resolve: (approved: boolean) => void
  toolCallId: string
  toolName: string
  args: unknown
}

const approvalStore = createPendingRequestStore<{ toolName: string, args: unknown }, boolean>({
  defaultResolveValue: false,
})

function toPendingApproval(
  entry: ReturnType<typeof approvalStore.getAll>[number],
): PendingApproval {
  return {
    resolve: entry.resolve,
    toolCallId: entry.requestId,
    toolName: entry.payload.toolName,
    args: entry.payload.args,
  }
}

export function requestApproval(
  toolCallId: string,
  toolName: string,
  args: unknown,
): Promise<boolean> {
  return approvalStore.request(toolCallId, { toolName, args })
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
