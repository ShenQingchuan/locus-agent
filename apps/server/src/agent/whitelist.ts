/**
 * 工具调用白名单管理
 * session 级别（关联会话，存 DB）和 global 级别（存 DB，无会话关联）
 */

import type { WhitelistRule } from '@locus-agent/agent-sdk'
import { getRiskLevel } from '@locus-agent/agent-sdk'
import { eq } from 'drizzle-orm'
import { db, whitelistRules } from '../db/index.js'

// ---------------------------------------------------------------------------
// 数据转换：DB row <-> WhitelistRule
// ---------------------------------------------------------------------------

function rowToRule(row: typeof whitelistRules.$inferSelect): WhitelistRule {
  return {
    id: row.id,
    toolName: row.toolName,
    pattern: row.pattern ?? undefined,
    scope: row.scope as 'session' | 'global',
    createdAt: row.createdAt.getTime(),
  }
}

// ---------------------------------------------------------------------------
// Session 级别白名单（存 DB，关联 conversationId）
// ---------------------------------------------------------------------------

export function getSessionRules(conversationId: string): WhitelistRule[] {
  const rows = db
    .select()
    .from(whitelistRules)
    .where(eq(whitelistRules.conversationId, conversationId))
    .all()
  return rows.map(rowToRule)
}

export function addSessionRule(conversationId: string, rule: WhitelistRule): void {
  db.insert(whitelistRules).values({
    id: rule.id,
    toolName: rule.toolName,
    pattern: rule.pattern ?? null,
    scope: 'session',
    conversationId,
    createdAt: new Date(rule.createdAt),
  }).run()
}

export function removeSessionRule(_conversationId: string, ruleId: string): void {
  db.delete(whitelistRules).where(eq(whitelistRules.id, ruleId)).run()
}

export function clearSessionRules(conversationId: string): void {
  db.delete(whitelistRules)
    .where(eq(whitelistRules.conversationId, conversationId))
    .run()
}

// ---------------------------------------------------------------------------
// Global 级别白名单（存 DB，scope='global'，无 conversationId）
// ---------------------------------------------------------------------------

export function getGlobalRules(): WhitelistRule[] {
  const rows = db
    .select()
    .from(whitelistRules)
    .where(eq(whitelistRules.scope, 'global'))
    .all()
  return rows.map(rowToRule)
}

export function addGlobalRule(rule: WhitelistRule): { success: boolean, error?: string } {
  // 安全校验：危险命令不允许添加进全局白名单
  const risk = getRiskLevel(rule.toolName, rule.pattern)
  if (risk === 'dangerous') {
    return { success: false, error: '危险命令不允许添加至全局白名单' }
  }

  db.insert(whitelistRules).values({
    id: rule.id,
    toolName: rule.toolName,
    pattern: rule.pattern ?? null,
    scope: 'global',
    conversationId: null,
    createdAt: new Date(rule.createdAt),
  }).run()
  return { success: true }
}

export function removeGlobalRule(ruleId: string): void {
  db.delete(whitelistRules).where(eq(whitelistRules.id, ruleId)).run()
}

// ---------------------------------------------------------------------------
// 白名单匹配
// ---------------------------------------------------------------------------

/**
 * 检查工具调用是否匹配某条白名单规则
 */
function matchesRule(rule: WhitelistRule, toolName: string, args: unknown): boolean {
  if (rule.toolName !== toolName)
    return false

  // 非 bash 工具：仅按工具名匹配
  if (toolName !== 'bash')
    return true

  // bash 工具：需要匹配命令前缀
  if (!rule.pattern)
    return true // 无 pattern 的规则匹配所有 bash 命令

  const command = String((args as Record<string, unknown>)?.command ?? '').trim()
  if (!command)
    return false

  return command === rule.pattern || command.startsWith(`${rule.pattern} `)
}

/**
 * 检查工具调用是否在白名单中（先查 session，再查 global）
 * @returns 匹配的规则，或 null 表示不在白名单中
 */
export function isWhitelisted(
  conversationId: string,
  toolName: string,
  args: unknown,
): WhitelistRule | null {
  // 1. 先检查 session 白名单
  const sessionRules = getSessionRules(conversationId)
  for (const rule of sessionRules) {
    if (matchesRule(rule, toolName, args))
      return rule
  }

  // 2. 再检查 global 白名单
  const globalRules = getGlobalRules()
  for (const rule of globalRules) {
    if (matchesRule(rule, toolName, args))
      return rule
  }

  return null
}

/**
 * 获取所有白名单规则（session + global）
 */
export function getAllRules(conversationId?: string): WhitelistRule[] {
  const globalRules = getGlobalRules()
  if (!conversationId)
    return globalRules

  const sessionRules = getSessionRules(conversationId)
  return [...sessionRules, ...globalRules]
}

/**
 * 删除任意规则（不区分 scope）
 */
export function removeRule(ruleId: string): void {
  db.delete(whitelistRules).where(eq(whitelistRules.id, ruleId)).run()
}
