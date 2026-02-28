import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

export type MarkDirtyFn = (conversationId: string) => void

const markConversationDirtyKey: InjectionKey<MarkDirtyFn> = Symbol('markConversationDirty')

/**
 * Provide 标记会话为 dirty 的方法
 * 在 ChatView.vue 中使用，让子组件可以标记会话已被修改
 */
export function provideMarkConversationDirty(fn: MarkDirtyFn): void {
  provide(markConversationDirtyKey, fn)
}

/**
 * Inject 标记会话为 dirty 的方法
 * 在子组件（如 MessageBubble、ChatInput）中使用
 */
export function useMarkConversationDirty(): MarkDirtyFn {
  const fn = inject(markConversationDirtyKey)
  if (!fn) {
    console.warn('[useMarkConversationDirty] 未找到 provide 的标记函数，使用空函数兜底')
    return () => {}
  }
  return fn
}
