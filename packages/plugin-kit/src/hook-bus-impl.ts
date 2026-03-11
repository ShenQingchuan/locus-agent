import type {
  HookBus,
  HookCategory,
  HookDecision,
  HookEventName,
  HookHandler,
  HookPayloadMap,
  HookScope,
  PermissionScope,
} from '@univedge/locus-agent-sdk'
import { HOOK_CATEGORIES, HookKind } from '@univedge/locus-agent-sdk'

interface SubscribedHandler {
  pluginId: string
  pluginVersion: string
  handler: HookHandler<any>
  grantedPermissions: PermissionScope[]
}

const DEFAULT_DEADLINE_MS = 5000

/**
 * Concrete implementation of HookBus.
 *
 * Dispatch strategy:
 * - All handlers for an event run concurrently (Promise.allSettled).
 * - Each handler receives a fully-typed HookInvocation with actor info.
 * - A per-handler deadline prevents stalling the pipeline.
 * - The caller inspects returned HookDecision[] and applies blocking/enriching logic.
 */
export class HookBusImpl implements HookBus {
  private subscriptions = new Map<HookEventName, SubscribedHandler[]>()
  private deadlineMs: number

  constructor(options?: { deadlineMs?: number }) {
    this.deadlineMs = options?.deadlineMs ?? DEFAULT_DEADLINE_MS
  }

  // ─── HookBus interface ────────────────────────────────────

  async emit<E extends HookEventName>(
    event: E,
    payload: HookPayloadMap[E],
    scope: HookScope,
  ): Promise<HookDecision[]> {
    const handlers = this.subscriptions.get(event)
    if (!handlers || handlers.length === 0) {
      return []
    }

    const category = HOOK_CATEGORIES[event]

    const results = await Promise.allSettled(
      handlers.map(async (sub) => {
        const invocation = {
          hook: event,
          invocationId: generateInvocationId(),
          sessionId: '',
          runId: '',
          scope,
          actor: {
            pluginId: sub.pluginId,
            pluginVersion: sub.pluginVersion,
          },
          payload,
          capabilities: deriveCapabilities(category),
          deadlineMs: this.deadlineMs,
        }

        return withDeadline(
          sub.handler(invocation),
          this.deadlineMs,
        )
      }),
    )

    const decisions: HookDecision[] = []
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        decisions.push(result.value)
      }
      else if (result.status === 'rejected') {
        console.warn(`[hook-bus] Handler rejected for "${event}":`, result.reason)
        decisions.push({ type: 'noop' })
      }
    }

    return decisions
  }

  on<E extends HookEventName>(
    event: E,
    handler: HookHandler<HookPayloadMap[E]>,
  ): () => void {
    const sub: SubscribedHandler = {
      pluginId: '__internal__',
      pluginVersion: '0.0.0',
      handler,
      grantedPermissions: [],
    }
    const list = this.subscriptions.get(event) ?? []
    list.push(sub)
    this.subscriptions.set(event, list)

    return () => this.off(event, handler)
  }

  off<E extends HookEventName>(
    event: E,
    handler: HookHandler<HookPayloadMap[E]>,
  ): void {
    const list = this.subscriptions.get(event)
    if (!list)
      return
    const idx = list.findIndex(s => s.handler === handler)
    if (idx !== -1)
      list.splice(idx, 1)
  }

  // ─── Plugin-aware subscription (used by PluginManager) ────

  subscribePlugin(
    pluginId: string,
    pluginVersion: string,
    event: HookEventName,
    handler: HookHandler<any>,
    grantedPermissions: PermissionScope[],
  ): void {
    const sub: SubscribedHandler = {
      pluginId,
      pluginVersion,
      handler,
      grantedPermissions,
    }
    const list = this.subscriptions.get(event) ?? []
    list.push(sub)
    this.subscriptions.set(event, list)
  }

  unsubscribePlugin(pluginId: string): void {
    for (const [event, list] of this.subscriptions.entries()) {
      this.subscriptions.set(
        event,
        list.filter(s => s.pluginId !== pluginId),
      )
    }
  }

  /** Check if any handlers are registered for a given event */
  hasHandlers(event: HookEventName): boolean {
    const list = this.subscriptions.get(event)
    return !!list && list.length > 0
  }
}

// ─── Helpers ──────────────────────────────────────────────

function generateInvocationId(): string {
  return `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

function deriveCapabilities(category: HookCategory): string[] {
  switch (category) {
    case HookKind.Observe:
      return ['read']
    case HookKind.Enrich:
      return ['read', 'append_context', 'patch_prompt', 'suggest', 'emit_artifact']
    case HookKind.Guard:
      return ['read', 'append_context', 'patch_prompt', 'suggest', 'emit_artifact', 'require_confirmation', 'block']
    default:
      return []
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Hook handler timed out after ${ms}ms`)), ms),
    ),
  ])
}
