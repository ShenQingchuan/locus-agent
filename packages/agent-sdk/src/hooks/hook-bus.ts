import type { HookEventName } from './events.js'
import type { HookPayloadMap } from './payloads.js'
import type { HookDecision, HookInvocation, HookScope } from './types.js'

/**
 * Handler function for a specific hook event.
 * Receives a typed invocation and returns a decision.
 */
export type HookHandler<T = unknown>
  = (invocation: HookInvocation<T>) => Promise<HookDecision>

/**
 * HookBus is the central event dispatcher for agent lifecycle hooks.
 *
 * SDK defines only the interface; concrete implementations live in the
 * server (where HookBus coordinates with PluginManager and PolicyEngine).
 */
export interface HookBus {
  /**
   * Emit a hook event, dispatching to all registered handlers.
   * Returns collected decisions from all handlers.
   */
  emit: <E extends HookEventName>(
    event: E,
    payload: HookPayloadMap[E],
    scope: HookScope,
  ) => Promise<HookDecision[]>

  /**
   * Register a handler for a specific hook event.
   * Returns an unsubscribe function.
   */
  on: <E extends HookEventName>(
    event: E,
    handler: HookHandler<HookPayloadMap[E]>,
  ) => () => void

  /**
   * Unregister a previously registered handler.
   */
  off: <E extends HookEventName>(
    event: E,
    handler: HookHandler<HookPayloadMap[E]>,
  ) => void
}
