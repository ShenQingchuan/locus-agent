export const interactiveTools = new Set<string>([
  'ask_question',
  'delegate',
])

export const trustedBuiltinTools = new Set<string>([
  'save_memory',
  'search_memories',
  'manage_todos',
])

export function isTrustedBuiltinTool(toolName: string): boolean {
  return trustedBuiltinTools.has(toolName)
}
