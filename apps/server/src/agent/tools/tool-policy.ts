export const interactiveTools = new Set<string>([
  'ask_question',
  'delegate',
])

export const trustedBuiltinTools = new Set<string>([
  'save_memory',
  'search_memories',
  'manage_todos',
  'manage_kanban',
  'write_plan',
  'read_plan',
])

export function isTrustedBuiltinTool(toolName: string): boolean {
  return trustedBuiltinTools.has(toolName)
}
