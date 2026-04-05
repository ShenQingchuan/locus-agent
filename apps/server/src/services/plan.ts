import type { ChatRequest } from '@univedge/locus-agent-sdk'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BuiltinTool } from '@univedge/locus-agent-sdk'
import { executeReadPlan } from '../agent/tools/manage_plans.js'

export interface PlanSnapshot {
  filename: string
  filePath: string
}

export type PlanBindingPayload = ChatRequest['planBinding']

const RE_NON_WORD_OR_HYPHEN = /[^\w-]/g
const RE_PLAN_TAG = /<plan\b[^>]*>[\s\S]*?<\/plan>/gi
const RE_PLAN_REF_TAG = /<plan_ref\b[^>]*>[\s\S]*?<\/plan_ref>/gi

const PLANS_BASE_DIR = join(homedir(), '.local', 'share', 'locus-agent', 'coding-plans')

export function normalizeProjectKey(projectKey?: string): string | null {
  const key = projectKey?.trim()
  if (!key)
    return null
  const safe = key.replace(RE_NON_WORD_OR_HYPHEN, '_')
  return safe.length > 0 ? safe : null
}

export function getPlansDir(projectKey?: string): string {
  const normalized = normalizeProjectKey(projectKey)
  if (!normalized)
    return join(PLANS_BASE_DIR, 'global')
  return join(PLANS_BASE_DIR, normalized)
}

export function extractLatestPlanFromDbMessages(
  dbMsgs: Array<{ toolCalls?: unknown[] | null }>,
  projectKey?: string,
): PlanSnapshot | null {
  for (let i = dbMsgs.length - 1; i >= 0; i--) {
    const toolCalls = dbMsgs[i]?.toolCalls
    if (!toolCalls || toolCalls.length === 0)
      continue

    for (let j = toolCalls.length - 1; j >= 0; j--) {
      const item = toolCalls[j] as { toolName?: unknown, args?: unknown }
      if (item?.toolName !== BuiltinTool.WritePlan)
        continue
      const args = item.args as { filename?: unknown }
      const filename = typeof args?.filename === 'string' ? args.filename.trim() : ''
      if (!filename)
        continue
      return {
        filename,
        filePath: join(getPlansDir(projectKey), filename),
      }
    }
  }
  return null
}

export function resolvePlanSnapshot(
  binding: PlanBindingPayload | undefined,
  dbMsgs: Array<{ toolCalls?: unknown[] | null }>,
  projectKey?: string,
): PlanSnapshot | null {
  if (binding?.mode === 'none')
    return null

  return extractLatestPlanFromDbMessages(dbMsgs, projectKey)
}

export function buildPlanInjectedMessage(message: string, plan: PlanSnapshot): string {
  const stripped = message
    .replace(RE_PLAN_TAG, '')
    .replace(RE_PLAN_REF_TAG, '')
    .trim()
  return `${stripped}\n\n<plan_ref>\nfilename: ${plan.filename}\npath: ${plan.filePath}\nread_with: read_plan(action="read", filename="${plan.filename}")\n</plan_ref>`
}

export { executeReadPlan }
