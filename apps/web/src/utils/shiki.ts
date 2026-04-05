import type { HighlighterGeneric } from 'shiki'
import { createHighlighter, createJavaScriptRegexEngine } from 'shiki'

/**
 * Singleton Shiki highlighter shared across CodeBlock and ShikiCode.
 *
 * Uses the JavaScript regex engine instead of the default Oniguruma WASM engine,
 * which eliminates 6x WASM chunk duplication in the Vite production build and
 * removes the ~3.6 MB wasm-*.js files entirely.
 */
let instance: Promise<HighlighterGeneric<any, any>> | null = null

export function getShikiHighlighter(): Promise<HighlighterGeneric<any, any>> {
  if (!instance) {
    instance = createHighlighter({
      themes: ['github-dark-default', 'min-light', 'github-dark', 'github-light'],
      langs: ['text'],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return instance!
}
