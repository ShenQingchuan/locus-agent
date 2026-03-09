import type { PromptPatch } from '../hooks/types.js'

export interface PromptSection {
  id: string
  content: string
  /** Lower number = rendered earlier. Default 100. */
  priority: number
}

/**
 * Composable system prompt builder.
 *
 * Supports the `prompt:assemble` hook lifecycle: plugins can patch sections
 * via `PromptPatch` decisions before the final prompt is built.
 */
export interface PromptBuilder {
  addSection: (section: PromptSection) => this
  removeSection: (id: string) => this
  patchSection: (id: string, patch: PromptPatch) => this
  getSections: () => PromptSection[]
  build: () => string
}

/**
 * Default implementation that concatenates sections ordered by priority.
 */
export function createPromptBuilder(): PromptBuilder {
  const sections = new Map<string, PromptSection>()

  const builder: PromptBuilder = {
    addSection(section) {
      sections.set(section.id, section)
      return builder
    },

    removeSection(id) {
      sections.delete(id)
      return builder
    },

    patchSection(id, patch) {
      const existing = sections.get(id)
      if (!existing)
        return builder

      switch (patch.action) {
        case 'append':
          existing.content += `\n${patch.content ?? ''}`
          break
        case 'prepend':
          existing.content = `${patch.content ?? ''}\n${existing.content}`
          break
        case 'replace':
          existing.content = patch.content ?? ''
          break
        case 'remove':
          sections.delete(id)
          break
      }

      return builder
    },

    getSections() {
      return [...sections.values()].sort((a, b) => a.priority - b.priority)
    },

    build() {
      return builder.getSections()
        .map(s => s.content)
        .join('\n\n')
    },
  }

  return builder
}
