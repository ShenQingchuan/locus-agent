import type {
  ChatRequest,
  SSEEvent,
  ToolCall,
  ToolResult,
} from '@univedge/locus-agent-sdk'
import type { ModelMessage } from 'ai'
import { CODING_PROVIDERS, createSSEEventPayload, extractDefaultPattern, getRiskLevel, isACPCodingProvider, isCodingModelProvider } from '@univedge/locus-agent-sdk'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { runKimiCLI } from '../agent/acp/kimi-cli.js'
import { runLocalClaudeCode } from '../agent/acp/local-claude-code.js'
import { requestApproval } from '../agent/approval.js'
import { runAgentLoop } from '../agent/loop.js'
import { createCodingModel, createLLMModel, getCurrentModelInfo } from '../agent/providers/index.js'
import { requestQuestionAnswer } from '../agent/question.js'
import { executeReadPlan } from '../agent/tools/manage_plans.js'
import { getWorkspaceRoot } from '../agent/tools/workspace-root.js'
import { config } from '../config.js'
import { cleanupSession, hasAbortController, setAbortController, setConfirmModeState, setSessionTimestamp, startSessionCleanupTask } from '../services/chat-session.js'
import { conversationExists, createScopedConversation, getConversation, touchConversation } from '../services/conversation.js'
import { agentMessagesToDbInputs, createUserMessage, dbMessagesToModelMessages } from '../services/message-formatter.js'
import { addMessage, addMessages, getLastNMessages, getMessages } from '../services/message.js'
import { buildPlanInjectedMessage, extractLatestPlanFromDbMessages, resolvePlanSnapshot } from '../services/plan.js'
import { resolveAllowedDirectory } from '../services/workspace-access.js'

export { abortSession, getActiveConfirmModeState, updateActiveConfirmMode } from '../services/chat-session.js'

export const chatRoutes = new Hono()

// 启动后台清理任务
startSessionCleanupTask()

const createSSEEvent = createSSEEventPayload

chatRoutes.get('/plans/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  if (!conversationId) {
    return c.json({ message: 'conversationId is required' }, 400)
  }

  const conversation = await getConversation(conversationId)
  if (!conversation) {
    return c.json({ message: 'Conversation not found' }, 404)
  }

  if (conversation.space !== 'coding') {
    return c.json({ currentPlan: null })
  }

  const dbMessages = await getMessages(conversationId)
  const latestPlan = extractLatestPlanFromDbMessages(dbMessages, conversation.projectKey ?? undefined)
  if (!latestPlan) {
    return c.json({ currentPlan: null })
  }

  const readResult = await executeReadPlan(
    { action: 'read', filename: latestPlan.filename },
    { projectKey: conversation.projectKey ?? undefined },
  )
  if (!readResult.success || !readResult.content) {
    return c.json({ currentPlan: null })
  }

  return c.json({
    currentPlan: {
      filename: latestPlan.filename,
      content: readResult.content,
    },
  })
})

// POST /api/chat - Stream chat response
chatRoutes.post('/', async (c) => {
  const body = await c.req.json<ChatRequest>()
  const {
    conversationId,
    message,
    attachments,
    confirmMode,
    thinkingMode,
    codingMode,
    planBinding,
    messageMetadata,
    space,
    projectKey,
    workspaceRoot: workspaceRootInput,
    codingExecutor,
  } = body

  const conversationSpace = space === 'coding' ? 'coding' : 'chat'
  const conversationProjectKey = typeof projectKey === 'string' && projectKey.trim().length > 0
    ? projectKey
    : undefined

  // 验证请求
  if (!conversationId || (!message.trim() && (!attachments || attachments.length === 0))) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'conversationId and either message or attachments are required',
        },
      },
      400,
    )
  }

  let resolvedWorkspaceRoot: string
  try {
    resolvedWorkspaceRoot = workspaceRootInput
      ? await resolveAllowedDirectory(workspaceRootInput)
      : getWorkspaceRoot()
  }
  catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_WORKSPACE_ROOT',
          message: error instanceof Error ? error.message : 'Invalid workspace root',
        },
      },
      400,
    )
  }

  // 检查会话是否存在，如果不存在则创建
  const exists = await conversationExists(conversationId)
  if (!exists) {
    // 自动创建会话，使用消息的前 50 个字符作为标题
    const normalizedMessage = message.trim()
    const title = normalizedMessage
      ? (normalizedMessage.length > 50 ? `${normalizedMessage.substring(0, 50)}...` : normalizedMessage)
      : '图片对话'
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

  // 保存用户消息到数据库（始终持久化，metadata 标记的消息由前端过滤）
  await addMessage(conversationId, {
    role: 'user',
    content: message,
    attachments,
    metadata: messageMetadata,
  })

  // 如果该会话已有活跃请求，先清理旧的
  if (hasAbortController(conversationId)) {
    cleanupSession(conversationId)
  }

  // 创建新的会话状态
  const abortController = new AbortController()
  setAbortController(conversationId, abortController)

  // 可变 confirmMode 状态，approve 端点收到 switchToYolo 时会实时更新
  const confirmModeState = { value: confirmMode ?? config.confirmMode }
  setConfirmModeState(conversationId, confirmModeState)

  // 记录会话创建时间戳，用于超时清理
  setSessionTimestamp(conversationId, Date.now())

  return streamSSE(c, async (stream) => {
    // 用于生成消息 ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // 收集 AI 响应数据以便保存
    let assistantText = ''
    let assistantReasoning = ''

    // Delegate results keyed by toolCallId (for persisting deltas to DB)
    const delegateFullResults = new Map<string, unknown>()

    try {
      const runtimeModelInfo = getCurrentModelInfo()
      const assistantModel = codingExecutor
        ? (isCodingModelProvider(codingExecutor)
            ? `${codingExecutor}/${CODING_PROVIDERS.find(cp => cp.value === codingExecutor)?.defaultModel || 'unknown'}`
            : `acp/${codingExecutor}`)
        : `${runtimeModelInfo.provider}/${runtimeModelInfo.model}`

      // 从 DB 加载消息历史（后端权威状态，不依赖前端传入的 messages）
      // 限制加载最近 100 条消息，避免长对话的 DB 查询和序列化开销
      // agent loop 内部的 auto-compaction 会进一步压缩上下文
      const MAX_DB_MESSAGES = 100
      const dbMessages = await getLastNMessages(conversationId, MAX_DB_MESSAGES)
      const convertedHistory = dbMessagesToModelMessages(dbMessages)
      let effectiveUserMessage = message
      if (
        conversationSpace === 'coding'
        && codingMode === 'build'
      ) {
        const boundPlan = resolvePlanSnapshot(planBinding, dbMessages, conversationProjectKey)
        if (boundPlan) {
          effectiveUserMessage = buildPlanInjectedMessage(message, boundPlan)
        }
      }

      const messages: ModelMessage[] = [...convertedHistory, createUserMessage(effectiveUserMessage, attachments)]

      const effectiveThinkingMode = thinkingMode ?? true
      // Use coding provider model if requested, otherwise use main LLM model
      const streamCallbacks = {
        onReasoningDelta: async (delta: string) => {
          assistantReasoning += delta
          await stream.writeSSE(createSSEEvent({
            type: 'reasoning-delta',
            reasoningDelta: delta,
          }))
        },
        onTextDelta: async (delta: string) => {
          assistantText += delta
          await stream.writeSSE(createSSEEvent({
            type: 'text-delta',
            textDelta: delta,
          }))
        },
        onToolCallStart: async (toolCallId: string, toolName: string, args: unknown) => {
          const toolCall: ToolCall = {
            toolCallId,
            toolName,
            args: args as Record<string, unknown>,
          }
          await stream.writeSSE(createSSEEvent({
            type: 'tool-call-start',
            toolCall,
          }))
        },
        onToolCallResult: async (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => {
          if (result && typeof result === 'object' && (result as { isSubAgentResult?: boolean }).isSubAgentResult) {
            delegateFullResults.set(toolCallId, result)
          }

          const toolResult: ToolResult = {
            toolCallId,
            toolName,
            result,
            isError,
            isInterrupted,
          }
          await stream.writeSSE(createSSEEvent({
            type: 'tool-call-result',
            toolResult,
          }))
        },
        onToolPendingApproval: async (toolCallId: string, toolName: string, args: unknown) => {
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
        onToolOutputDelta: async (toolCallId: string, streamType: 'stdout' | 'stderr', delta: string) => {
          await stream.writeSSE(createSSEEvent({
            type: 'tool-output-delta',
            toolCallId,
            stream: streamType,
            delta,
          }))
        },
        onQuestionPending: async (toolCallId: string, questions: Parameters<typeof requestQuestionAnswer>[1]) => {
          await stream.writeSSE(createSSEEvent({
            type: 'question-pending',
            toolCallId,
            questions,
          }))
        },
        onDelegateDelta: async (toolCallId: string, delta: SSEEvent extends never ? never : any) => {
          const event: SSEEvent = {
            type: 'delegate-delta',
            toolCallId,
            delta,
          }
          await stream.writeSSE(createSSEEvent(event))
        },
      }

      let result
      if (codingExecutor && isACPCodingProvider(codingExecutor)) {
        const acpRunner = codingExecutor === 'kimi-cli' ? runKimiCLI : runLocalClaudeCode

        // Build a lightweight prior-context summary from the conversation history
        // so that a fresh ACP session (e.g. after switching providers) has context.
        const PRIOR_CONTEXT_MAX_MSGS = 12
        const PRIOR_CONTEXT_CONTENT_LIMIT = 300
        const recentForContext = dbMessages.slice(-PRIOR_CONTEXT_MAX_MSGS)
        const priorContext = recentForContext.length > 0
          ? recentForContext
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .map((m) => {
                const label = m.role === 'user' ? 'User' : 'Assistant'
                const content = m.content.length > PRIOR_CONTEXT_CONTENT_LIMIT
                  ? `${m.content.slice(0, PRIOR_CONTEXT_CONTENT_LIMIT)}…`
                  : m.content
                return `[${label}]: ${content}`
              })
              .join('\n')
          : undefined

        const acpResult = await acpRunner({
          prompt: effectiveUserMessage,
          attachments,
          conversationId,
          workspaceRoot: resolvedWorkspaceRoot,
          abortSignal: abortController.signal,
          priorContext,
          ...streamCallbacks,
        })

        result = {
          finishReason: acpResult.finishReason,
          usage: acpResult.usage,
          generatedMessages: [] as ModelMessage[],
        }

        await stream.writeSSE(createSSEEvent({
          type: 'done',
          messageId,
          model: acpResult.model ? `acp/${codingExecutor}/${acpResult.model}` : assistantModel,
          usage: {
            promptTokens: acpResult.usage.inputTokens,
            completionTokens: acpResult.usage.outputTokens,
            totalTokens: acpResult.usage.totalTokens,
          },
        }))
      }
      else {
        const model = codingExecutor && isCodingModelProvider(codingExecutor)
          ? await createCodingModel(codingExecutor)
          : createLLMModel({ modelId: runtimeModelInfo.model, thinkingMode: effectiveThinkingMode })

        result = await runAgentLoop({
          model,
          messages,
          abortSignal: abortController.signal,
          confirmMode: () => confirmModeState.value,
          thinkingMode: effectiveThinkingMode,
          space: conversationSpace,
          codingMode: conversationSpace === 'coding' ? codingMode : undefined,
          conversationId,
          projectKey: conversationProjectKey,
          workspaceRoot: resolvedWorkspaceRoot,
          ...streamCallbacks,
          getToolApproval: async (toolCallId, toolName, args) => {
            return requestApproval(conversationId, toolCallId, toolName, args)
          },
          getQuestionAnswer: async (toolCallId, questions) => {
            return requestQuestionAnswer(toolCallId, questions)
          },
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
      }

      // 保存 AI 响应消息到数据库
      if (result.finishReason !== 'aborted') {
        const usage = {
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        }

        const dbInputs = agentMessagesToDbInputs(result.generatedMessages, assistantModel, usage)

        // Inject full delegate results (with deltas) into DB inputs
        if (delegateFullResults.size > 0) {
          for (const input of dbInputs) {
            if (input.role !== 'tool' || !input.toolResults)
              continue
            for (const tr of input.toolResults) {
              const fullResult = delegateFullResults.get(tr.toolCallId)
              if (fullResult)
                tr.result = fullResult
            }
          }
        }

        if (dbInputs.length > 0) {
          await addMessages(conversationId, dbInputs)
        }
        else if (assistantText || assistantReasoning) {
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
      // 清理所有活跃状态，防止内存泄漏
      cleanupSession(conversationId)
    }
  })
})
