import { BuiltinTool } from '@locus-agent/agent-sdk'

export const interactiveTools = new Set<string>([
  BuiltinTool.AskQuestion,
  BuiltinTool.Delegate,
])

export const trustedBuiltinTools = new Set<string>([
  BuiltinTool.SaveMemory,
  BuiltinTool.SearchMemories,
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
