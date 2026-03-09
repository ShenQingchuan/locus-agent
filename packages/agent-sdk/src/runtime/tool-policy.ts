export type ToolCategory = 'interactive' | 'trusted' | 'serial' | 'normal'

export interface ToolPolicyConfig {
  /** Tools requiring special flow (e.g. ask_question, delegate) */
  interactive: ReadonlySet<string>
  /** Tools that can bypass approval (e.g. save_memory, manage_todos) */
  trusted: ReadonlySet<string>
  /** Tools that must execute sequentially (e.g. str_replace, write_file, bash) */
  serial: ReadonlySet<string>
}

export function classifyTool(toolName: string, policy: ToolPolicyConfig): ToolCategory {
  if (policy.interactive.has(toolName))
    return 'interactive'
  if (policy.trusted.has(toolName))
    return 'trusted'
  if (policy.serial.has(toolName))
    return 'serial'
  return 'normal'
}
