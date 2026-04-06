import type { InjectionKey, Ref } from 'vue'

/** Scroll root of the virtualized message list — used for deferring heavy inline diff mounts. */
export const chatMessageListScrollRootKey: InjectionKey<Ref<HTMLElement | null>> = Symbol(
  'chatMessageListScrollRoot',
)
