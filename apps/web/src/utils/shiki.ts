import type { HighlighterGeneric } from 'shiki'
import { createHighlighter } from 'shiki'

/**
 * 全局唯一的 Shiki highlighter 实例（单例）
 * 统一加载所有需要的主题，供 CodeBlock 和 ShikiCode 共享
 */
let instance: Promise<HighlighterGeneric<any, any>> | null = null

export function getShikiHighlighter(): Promise<HighlighterGeneric<any, any>> {
  if (!instance) {
    instance = createHighlighter({
      themes: ['github-dark-default', 'min-light', 'github-dark', 'github-light'],
      langs: ['text'],
    })
  }
  return instance
}
