import { BuiltinTool } from '@univedge/locus-agent-sdk'

export const interactiveTools = new Set<string>([
  BuiltinTool.AskQuestion,
  BuiltinTool.Delegate,
])

export const trustedBuiltinTools = new Set<string>([
  BuiltinTool.ManageMemory,
  BuiltinTool.SearchMemory,
  BuiltinTool.Skill,
  BuiltinTool.ManageTodos,
  BuiltinTool.ManageKanban,
  BuiltinTool.WritePlan,
  BuiltinTool.ReadPlan,
  BuiltinTool.PlanExit,
])

/** Tools that must run serially to avoid file-system conflicts */
export const serialTools = new Set<string>([
  BuiltinTool.StrReplace,
  BuiltinTool.WriteFile,
  BuiltinTool.Bash,
])

export function isTrustedBuiltinTool(toolName: string): boolean {
  return trustedBuiltinTools.has(toolName)
}
