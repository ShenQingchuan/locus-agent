import type { WhitelistRule } from '@univedge/locus-agent-sdk'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  getPendingApproval,
  resolveApproval,
  resolvePendingApprovalsForConversation,
} from '../agent/approval.js'
import { resolveQuestionAnswer } from '../agent/question.js'
import {
  addGlobalRule,
  addSessionRule,
} from '../agent/whitelist.js'
import {
  abortSession,
  getActiveConfirmModeState,
} from './chat.js'

const AbortSchema = z.object({
  conversationId: z.string().min(1),
})

const ApproveSchema = z.object({
  conversationId: z.string().min(1),
  toolCallId: z.string().min(1),
  approved: z.boolean(),
  switchToYolo: z.boolean().optional(),
  addToWhitelist: z.object({
    pattern: z.string(),
    scope: z.enum(['session', 'global']),
  }).optional(),
})

const AnswerSchema = z.object({
  toolCallId: z.string().min(1),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
})

export const approvalRoutes = new Hono()

// POST /api/chat/abort - Abort current stream
approvalRoutes.post('/abort', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON' } }, 400)
  }

  const parsed = AbortSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'conversationId is required' } },
      400,
    )
  }

  const { conversationId } = parsed.data
  const aborted = abortSession(conversationId)
  return c.json({ success: true, aborted })
})

// POST /api/chat/approve - Approve or reject tool execution
approvalRoutes.post('/approve', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON' } }, 400)
  }

  const parsed = ApproveSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'conversationId, toolCallId, and approved are required',
        },
      },
      400,
    )
  }

  const { conversationId, toolCallId, approved, switchToYolo, addToWhitelist } = parsed.data

  // 实时切换当前运行中 loop 的 confirmMode
  if (switchToYolo && approved) {
    const state = getActiveConfirmModeState(conversationId)
    if (state) {
      state.value = false
    }
  }

  // 处理"加入白名单"请求
  if (addToWhitelist && approved) {
    const ruleId = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    // 从 pending approval 中获取工具名称
    const pending = getPendingApproval(toolCallId)
    if (pending) {
      const rule: WhitelistRule = {
        id: ruleId,
        toolName: pending.toolName,
        pattern: addToWhitelist.pattern,
        scope: addToWhitelist.scope,
        createdAt: Date.now(),
      }

      if (addToWhitelist.scope === 'global') {
        const result = addGlobalRule(rule)
        if (!result.success) {
          return c.json(
            {
              success: false,
              error: {
                code: 'WHITELIST_DENIED',
                message: result.error ?? '无法添加至全局白名单',
              },
            },
            400,
          )
        }
      }
      else {
        addSessionRule(conversationId, rule)
      }
    }
  }

  const resolved = resolveApproval(toolCallId, approved)

  if (!resolved) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No pending approval found for this toolCallId',
        },
      },
      404,
    )
  }

  if (switchToYolo && approved) {
    resolvePendingApprovalsForConversation(conversationId, true, toolCallId)
  }

  return c.json({ success: true, approved })
})

// POST /api/chat/answer - Submit answers to ask_question tool
approvalRoutes.post('/answer', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON' } }, 400)
  }

  const parsed = AnswerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'toolCallId and answers are required',
        },
      },
      400,
    )
  }

  const { toolCallId, answers } = parsed.data

  const resolved = resolveQuestionAnswer(toolCallId, answers)

  if (!resolved) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No pending question found for this toolCallId',
        },
      },
      404,
    )
  }

  return c.json({ success: true })
})
