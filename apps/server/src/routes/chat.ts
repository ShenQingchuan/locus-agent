import type {
  ChatRequest,
  CoreMessage as SharedCoreMessage,
  SSEEvent,
  ToolApprovalRequest,
  ToolCall,
  ToolResult,
  WhitelistRule,
} from '@locus-agent/shared'
import type { ModelMessage } from 'ai'
import type { QuestionAnswer } from '../agent/tools/ask_question.js'
import { extractDefaultPattern, getRiskLevel } from '@locus-agent/shared'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getPendingApproval, requestApproval, resolveApproval } from '../agent/approval.js'
import { runAgentLoop } from '../agent/loop.js'
import { createLLMModel, getCurrentModelInfo } from '../agent/providers/index.js'
import { requestQuestionAnswer, resolveQuestionAnswer } from '../agent/question.js'
import {
  addGlobalRule,
  addSessionRule,
  getAllRules,
  removeRule,
} from '../agent/whitelist.js'
import { config } from '../config.js'
import { conversationExists, createScopedConversation, getConversation, touchConversation } from '../services/conversation.js'
import { addMessage } from '../services/message.js'

export const chatRoutes = new Hono()

/**
 * 活跃的 AbortController 映射
 * key: conversationId
 */
const activeAbortControllers = new Map<string, AbortController>()

/**
 * 活跃会话的可变 confirmMode 状态
 * key: conversationId, value: 可变引用，可由 approve 端点或 conversation 更新实时变更
 */
const activeConfirmModes = new Map<string, { value: boolean }>()

/**
 * 更新活跃会话的 confirmMode（供外部路由调用）
 */
export function updateActiveConfirmMode(conversationId: string, confirmMode: boolean): void {
  const state = activeConfirmModes.get(conversationId)
  if (state) {
    state.value = confirmMode
  }
}

/**
 * 发送 SSE 事件的辅助函数
 */
function createSSEEvent(event: SSEEvent): { event: string, data: string } {
  return {
    event: 'message',
    data: JSON.stringify(event),
  }
}

/**
 * 将用户消息转换为 CoreMessage 格式
 */
function createUserMessage(content: string): ModelMessage {
  return {
    role: 'user',
    content,
  }
}

/**
 * 将 shared 的 CoreMessage 转换为 AI SDK 的 ModelMessage
 */
function convertToModelMessage(msg: SharedCoreMessage): ModelMessage {
  switch (msg.role) {
    case 'user':
      return { role: 'user', content: msg.content }
    case 'assistant':
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: msg.toolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.args,
          })),
        }
      }
      return { role: 'assistant', content: msg.content }
    case 'system':
      return { role: 'system', content: msg.content }
    case 'tool':
      return {
        role: 'tool',
        content: msg.toolResults.map(tr => ({
          type: 'tool-result' as const,
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          output: tr.isError
            ? { type: 'error-text' as const, value: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result) }
            : { type: 'text' as const, value: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result) },
        })),
      }
  }
}

// POST /api/chat - Stream chat response
chatRoutes.post('/', async (c) => {
  const body = await c.req.json<ChatRequest>()
  const {
    conversationId,
    message,
    messages: historyMessages,
    confirmMode,
    thinkingMode,
    space,
    projectKey,
  } = body

  const conversationSpace = space === 'coding' ? 'coding' : 'chat'
  const conversationProjectKey = typeof projectKey === 'string' && projectKey.trim().length > 0
    ? projectKey
    : undefined

  // 验证请求
  if (!conversationId || !message) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'conversationId and message are required',
        },
      },
      400,
    )
  }

  // 检查会话是否存在，如果不存在则创建
  const exists = await conversationExists(conversationId)
  if (!exists) {
    // 自动创建会话，使用消息的前 50 个字符作为标题
    const title = message.length > 50 ? `${message.substring(0, 50)}...` : message
    await createScopedConversation({
      title,
      id: conversationId,
      space: conversationSpace,
      projectKey: conversationProjectKey,
    })
  }
  else {
    const existingConversation = await getConversation(conversationId)
    if (existingConversation) {
      const mismatchSpace = existingConversation.space !== conversationSpace
      const mismatchProjectKey = (existingConversation.projectKey || null) !== (conversationProjectKey || null)

      if (mismatchSpace || mismatchProjectKey) {
        return c.json(
          {
            success: false,
            error: {
              code: 'CONVERSATION_SCOPE_MISMATCH',
              message: 'Conversation scope does not match the requested context',
            },
          },
          400,
        )
      }
    }
  }

  // 保存用户消息到数据库
  await addMessage(conversationId, {
    role: 'user',
    content: message,
  })

  // 取消之前的请求（如果存在）
  const existingController = activeAbortControllers.get(conversationId)
  if (existingController) {
    existingController.abort()
    activeAbortControllers.delete(conversationId)
  }

  // 创建新的 AbortController
  const abortController = new AbortController()
  activeAbortControllers.set(conversationId, abortController)

  // 可变 confirmMode 状态，approve 端点收到 switchToYolo 时会实时更新
  const confirmModeState = { value: confirmMode ?? config.confirmMode }
  activeConfirmModes.set(conversationId, confirmModeState)

  return streamSSE(c, async (stream) => {
    // 用于生成消息 ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 收集 AI 响应数据以便保存
    let assistantText = ''
    let assistantReasoning = ''
    const collectedToolCalls: ToolCall[] = []
    const collectedToolResults: ToolResult[] = []

    try {
      const runtimeModelInfo = getCurrentModelInfo()
      const assistantModel = `${runtimeModelInfo.provider}/${runtimeModelInfo.model}`

      // 构建消息历史
      // 将 shared 类型转换为 AI SDK 类型
      const convertedHistory: ModelMessage[] = historyMessages
        ? historyMessages.map(m => convertToModelMessage(m))
        : []
      const messages: ModelMessage[] = [...convertedHistory, createUserMessage(message)]

      const effectiveThinkingMode = thinkingMode ?? true
      const result = await runAgentLoop({
        model: createLLMModel(runtimeModelInfo.model, effectiveThinkingMode),
        messages,
        abortSignal: abortController.signal,
        confirmMode: () => confirmModeState.value,
        thinkingMode: effectiveThinkingMode,
        conversationId,

        // 思考过程增量回调
        onReasoningDelta: async (delta) => {
          assistantReasoning += delta
          await stream.writeSSE(createSSEEvent({
            type: 'reasoning-delta',
            reasoningDelta: delta,
          }))
        },

        // 文本增量回调
        onTextDelta: async (delta) => {
          assistantText += delta
          await stream.writeSSE(createSSEEvent({
            type: 'text-delta',
            textDelta: delta,
          }))
        },

        // 工具调用开始回调
        onToolCallStart: async (toolCallId, toolName, args) => {
          const toolCall: ToolCall = {
            toolCallId,
            toolName,
            args: args as Record<string, unknown>,
          }
          collectedToolCalls.push(toolCall)
          await stream.writeSSE(createSSEEvent({
            type: 'tool-call-start',
            toolCall,
          }))
        },

        // 工具调用结果回调
        onToolCallResult: async (toolCallId, toolName, result, isError, isInterrupted) => {
          const toolResult: ToolResult = {
            toolCallId,
            toolName,
            result,
            isError,
            isInterrupted,
          }
          collectedToolResults.push(toolResult)
          await stream.writeSSE(createSSEEvent({
            type: 'tool-call-result',
            toolResult,
          }))
        },

        // 工具等待确认回调（确认模式下使用）
        onToolPendingApproval: async (toolCallId, toolName, args) => {
          const argsRecord = args as Record<string, unknown>
          const suggestedPattern = extractDefaultPattern(toolName, argsRecord)
          const riskLevel = getRiskLevel(toolName, suggestedPattern)
          await stream.writeSSE(createSSEEvent({
            type: 'tool-pending-approval',
            toolCallId,
            toolName,
            args: argsRecord,
            suggestedPattern,
            riskLevel,
          }))
        },

        // 工具执行流式输出回调（如 bash 的 stdout/stderr）
        onToolOutputDelta: async (toolCallId, streamType, delta) => {
          await stream.writeSSE(createSSEEvent({
            type: 'tool-output-delta',
            toolCallId,
            stream: streamType,
            delta,
          }))
        },

        // 获取工具确认结果（确认模式下使用）
        getToolApproval: async (toolCallId, toolName, args) => {
          return requestApproval(toolCallId, toolName, args)
        },

        // 提问等待回答回调（ask_question 工具使用）
        onQuestionPending: async (toolCallId, questions) => {
          await stream.writeSSE(createSSEEvent({
            type: 'question-pending',
            toolCallId,
            questions,
          }))
        },

        // 获取用户对提问的回答（ask_question 工具使用）
        getQuestionAnswer: async (toolCallId, questions) => {
          return requestQuestionAnswer(toolCallId, questions)
        },

        // Delegate 子代理状态流式回调
        onDelegateDelta: async (toolCallId, delta) => {
          const event: SSEEvent = {
            type: 'delegate-delta',
            toolCallId,
            delta,
          }
          await stream.writeSSE(createSSEEvent(event))
        },

        // 完成回调
        onFinish: async (_finishReason, usage) => {
          await stream.writeSSE(createSSEEvent({
            type: 'done',
            messageId,
            model: assistantModel,
            usage: {
              promptTokens: usage.inputTokens,
              completionTokens: usage.outputTokens,
              totalTokens: usage.inputTokens + usage.outputTokens,
            },
          }))
        },
      })

      // 保存 AI 响应消息到数据库
      if (result.finishReason !== 'aborted') {
        const usage = {
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        }

        // 如果有工具调用，保存包含工具信息的消息
        if (collectedToolCalls.length > 0) {
          // 保存 assistant 消息（包含工具调用）
          await addMessage(conversationId, {
            role: 'assistant',
            content: assistantText || '',
            reasoning: assistantReasoning || undefined,
            model: assistantModel,
            toolCalls: collectedToolCalls,
            usage,
          })

          // 保存 tool 消息（包含工具结果）
          if (collectedToolResults.length > 0) {
            await addMessage(conversationId, {
              role: 'tool',
              content: '',
              toolResults: collectedToolResults,
            })
          }
        }
        else {
          // 没有工具调用，只保存普通文本响应
          await addMessage(conversationId, {
            role: 'assistant',
            content: assistantText,
            reasoning: assistantReasoning || undefined,
            model: assistantModel,
            usage,
          })
        }

        // 更新会话的 updatedAt 时间
        await touchConversation(conversationId)
      }
    }
    catch (error) {
      // 检查是否是取消导致的错误
      if (abortController.signal.aborted) {
        // 取消不算错误
        return
      }

      // 发送错误事件
      const errorMessage = error instanceof Error ? error.message : String(error)
      await stream.writeSSE(createSSEEvent({
        type: 'error',
        code: 'AGENT_ERROR',
        message: errorMessage,
      }))
    }
    finally {
      activeAbortControllers.delete(conversationId)
      activeConfirmModes.delete(conversationId)
    }
  })
})

// POST /api/chat/abort - Abort current stream
chatRoutes.post('/abort', async (c) => {
  const body = await c.req.json<{ conversationId: string }>()
  const { conversationId } = body

  if (!conversationId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'conversationId is required',
        },
      },
      400,
    )
  }

  const controller = activeAbortControllers.get(conversationId)
  if (controller) {
    controller.abort()
    activeAbortControllers.delete(conversationId)
    return c.json({ success: true, aborted: true })
  }

  return c.json({ success: true, aborted: false })
})

// POST /api/chat/approve - Approve or reject tool execution
chatRoutes.post('/approve', async (c) => {
  const body = await c.req.json<ToolApprovalRequest>()
  const { conversationId, toolCallId, approved, switchToYolo, addToWhitelist } = body

  if (!conversationId || !toolCallId || approved === undefined) {
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

  // 实时切换当前运行中 loop 的 confirmMode
  if (switchToYolo) {
    const state = activeConfirmModes.get(conversationId)
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

  return c.json({ success: true, approved })
})

// POST /api/chat/answer - Submit answers to ask_question tool
chatRoutes.post('/answer', async (c) => {
  const body = await c.req.json<{
    toolCallId: string
    answers: QuestionAnswer[]
  }>()
  const { toolCallId, answers } = body

  if (!toolCallId || !answers) {
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

// GET /api/chat/whitelist - Get whitelist rules
chatRoutes.get('/whitelist', async (c) => {
  const conversationId = c.req.query('conversationId')
  const rules = getAllRules(conversationId || undefined)
  return c.json({ success: true, rules })
})

// DELETE /api/chat/whitelist/:id - Delete a whitelist rule
chatRoutes.delete('/whitelist/:id', async (c) => {
  const ruleId = c.req.param('id')
  if (!ruleId) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Rule ID is required' },
      },
      400,
    )
  }
  removeRule(ruleId)
  return c.json({ success: true })
})
