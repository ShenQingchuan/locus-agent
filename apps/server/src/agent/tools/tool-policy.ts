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

export function isTrustedBuiltinTool(toolName: string): boolean {
  return trustedBuiltinTools.has(toolName)
}
