import { BuiltinTool } from '@univedge/locus-agent-sdk'

/**
 * Tools handled directly by the agent loop (not via the regular tool executor).
 * These tools bypass the shouldConfirm approval flow.
 */
export const interactiveTools = new Set<string>([
  BuiltinTool.AskQuestion,
  BuiltinTool.Delegate,
])

/**
 * Subset of interactiveTools that must run one at a time.
 * AskQuestion requires sequential execution because the user can only answer
 * one prompt at a time. Delegate sub-agents are independent and safe to
 * parallelize, so they are intentionally excluded from this set.
 */
export const sequentialInteractiveTools = new Set<string>([
  BuiltinTool.AskQuestion,
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
