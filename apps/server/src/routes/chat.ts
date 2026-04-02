import type {
  ChatRequest,
  MessageImageAttachment,
  SSEEvent,
  ToolCall,
  ToolResult,
} from '@univedge/locus-agent-sdk'
import type { ModelMessage } from 'ai'
import type { AddMessageInput } from '../services/message.js'
import { Buffer } from 'node:buffer'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BuiltinTool, CODING_PROVIDERS, createSSEEventPayload, extractDefaultPattern, getRiskLevel, isACPCodingProvider, isCodingModelProvider } from '@univedge/locus-agent-sdk'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { runKimiCLI } from '../agent/acp/kimi-cli.js'
import { runLocalClaudeCode } from '../agent/acp/local-claude-code.js'
import {
  requestApproval,
} from '../agent/approval.js'
import { runAgentLoop } from '../agent/loop.js'
import { normalizeToolCallMessageSequence } from '../agent/loop/message-utils.js'
import { createCodingModel, createLLMModel, getCurrentModelInfo } from '../agent/providers/index.js'
import { requestQuestionAnswer } from '../agent/question.js'
import { executeReadPlan } from '../agent/tools/manage_plans.js'
import { getWorkspaceRoot } from '../agent/tools/workspace-root.js'
import { config } from '../config.js'
import { conversationExists, createScopedConversation, getConversation, touchConversation } from '../services/conversation.js'
import { addMessage, addMessages, getLastNMessages, getMessages } from '../services/message.js'
import { resolveAllowedDirectory } from '../services/workspace-access.js'

const RE_BASE64_DATA_URL = /^data:.*?;base64,(.+)$/
const RE_NON_WORD_OR_HYPHEN = /[^\w-]/g
const RE_PLAN_TAG = /<plan\b[^>]*>[\s\S]*?<\/plan>/gi
const RE_PLAN_REF_TAG = /<plan_ref\b[^>]*>[\s\S]*?<\/plan_ref>/gi

export const chatRoutes = new Hono()

/**
 * 活跃的 AbortController 映射
 * key: conversationId
 *
 * 清理策略（防止内存泄漏）：
 * 1. 流正常完成/异常：finally 块调用 cleanupSession()
 * 2. 客户端中止：/abort 端点调用 cleanupSession()
 * 3. 超时清理：后台任务定期清理超时会话
 */
const activeAbortControllers = new Map<string, AbortController>()

/**
 * 活跃会话的可变 confirmMode 状态
 * key: conversationId, value: 可变引用，可由 approve 端点或 conversation 更新实时变更
 *
 * 清理策略：同 activeAbortControllers
 */
const activeConfirmModes = new Map<string, { value: boolean }>()

/**
 * 活跃会话的创建时间戳（用于超时检测）
 * key: conversationId, value: 创建时间戳（ms）
 */
const activeSessionTimestamps = new Map<string, number>()

/**
 * 清理超时会话的间隔和超时时间
 */
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000 // 每 5 分钟检查一次
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 分钟未活动则清理

/**
 * 清理指定会话的所有活跃状态
 * 安全地处理已中止的控制器
 */
function cleanupSession(conversationId: string): void {
  const controller = activeAbortControllers.get(conversationId)
  if (controller) {
    try {
      controller.abort()
    }
    catch {
      // 忽略已中止的控制器错误
    }
  }
  activeAbortControllers.delete(conversationId)
  activeConfirmModes.delete(conversationId)
  activeSessionTimestamps.delete(conversationId)
}

/**
 * 后台清理任务：定期清理超时的会话
 */
function startSessionCleanupTask(): void {
  setInterval(() => {
    const now = Date.now()
    const expired: string[] = []

    for (const [conversationId, timestamp] of activeSessionTimestamps.entries()) {
      if (now - timestamp > SESSION_TIMEOUT) {
        expired.push(conversationId)
      }
    }

    for (const conversationId of expired) {
      cleanupSession(conversationId)
    }
  }, SESSION_CLEANUP_INTERVAL)
}

// 启动后台清理任务
startSessionCleanupTask()

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
 * 获取活跃会话的 confirmMode 可变引用（供 approval 路由直接修改）
 */
export function getActiveConfirmModeState(conversationId: string): { value: boolean } | undefined {
  return activeConfirmModes.get(conversationId)
}

/**
 * 中止指定会话的活跃流并清理状态
 * @returns 是否成功中止（false 表示没有活跃的流）
 */
export function abortSession(conversationId: string): boolean {
  const controller = activeAbortControllers.get(conversationId)
  if (controller) {
    try {
      controller.abort()
    }
    catch {
      // 忽略已中止的控制器错误
    }
    cleanupSession(conversationId)
    return true
  }
  return false
}

const createSSEEvent = createSSEEventPayload

function toModelImagePayload(attachment: MessageImageAttachment): string | Uint8Array {
  const match = attachment.dataUrl.match(RE_BASE64_DATA_URL)
  if (!match?.[1])
    return attachment.dataUrl
  return Uint8Array.from(Buffer.from(match[1], 'base64'))
}

/**
 * 将用户消息转换为 CoreMessage 格式
 */
function createUserMessage(content: string, attachments?: MessageImageAttachment[]): ModelMessage {
  if (!attachments || attachments.length === 0) {
    return {
      role: 'user',
      content,
    }
  }

  return {
    role: 'user',
    content: [
      ...(content.trim().length > 0 ? [{ type: 'text' as const, text: content }] : []),
      ...attachments.map(attachment => ({
        type: 'image' as const,
        image: toModelImagePayload(attachment),
        mimeType: attachment.mimeType,
      })),
    ],
  }
}

function normalizeToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
      // Ignore non-JSON strings and preserve them below.
    }
  }

  return args && typeof args === 'object' && !Array.isArray(args)
    ? args as Record<string, unknown>
    : { value: args }
}

function buildAssistantMessageFromDbMessage(message: {
  content: string
  reasoning?: string | null
  toolCalls?: unknown[] | null
}): ModelMessage | null {
  const content: Array<
    | { type: 'reasoning', text: string }
    | { type: 'text', text: string }
    | { type: 'tool-call', toolCallId: string, toolName: string, input: Record<string, unknown> }
  > = []

  if (message.reasoning) {
    content.push({
      type: 'reasoning',
      text: message.reasoning,
    })
  }

  const toolCalls = message.toolCalls as Array<{ toolCallId: string, toolName: string, args: unknown }> | null
  if (toolCalls?.length) {
    for (const toolCall of toolCalls) {
      if (!toolCall?.toolCallId || !toolCall.toolName)
        continue
      content.push({
        type: 'tool-call',
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        input: normalizeToolArgs(toolCall.args),
      })
    }
  }

  if (message.content) {
    content.push({
      type: 'text',
      text: message.content,
    })
  }

  return content.length > 0
    ? {
        role: 'assistant',
        content,
      }
    : null
}

function buildToolMessageFromDbMessage(message: {
  toolResults?: unknown[] | null
}): ModelMessage | null {
  const toolResults = message.toolResults as Array<{ toolCallId: string, toolName: string, result: unknown, isError?: boolean }> | null
  if (!toolResults?.length)
    return null

  const content = toolResults
    .filter(toolResult => toolResult?.toolCallId && toolResult.toolName)
    .map(toolResult => ({
      type: 'tool-result' as const,
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      output: toolResult.isError
        ? { type: 'error-text' as const, value: typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result) }
        : { type: 'text' as const, value: typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result) },
    }))

  if (content.length === 0)
    return null

  return {
    role: 'tool',
    content,
  }
}

function decodeToolOutput(output: {
  type: string
  value?: unknown
  reason?: string
}): {
  result: unknown
  isError?: boolean
} {
  switch (output.type) {
    case 'error-text':
      return {
        result: output.value ?? '',
        isError: true,
      }
    case 'error-json':
      return {
        result: output.value,
        isError: true,
      }
    case 'execution-denied':
      return {
        result: output.reason ?? 'Tool execution denied.',
        isError: true,
      }
    case 'json':
    case 'content':
    case 'text':
    default:
      return {
        result: output.value ?? '',
      }
  }
}

function agentMessagesToDbInputs(
  messages: ModelMessage[],
  assistantModel: string,
  usage: AddMessageInput['usage'],
): AddMessageInput[] {
  const dbInputs: AddMessageInput[] = []

  for (const message of messages) {
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        if (!message.content)
          continue
        dbInputs.push({
          role: 'assistant',
          content: message.content,
          model: assistantModel,
        })
        continue
      }

      let content = ''
      let reasoning = ''
      const toolCalls: ToolCall[] = []

      for (const part of message.content) {
        switch (part.type) {
          case 'text':
            content += part.text
            break
          case 'reasoning':
            reasoning += part.text
            break
          case 'tool-call':
            toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: normalizeToolArgs(part.input),
            })
            break
        }
      }

      if (!content && !reasoning && toolCalls.length === 0)
        continue

      dbInputs.push({
        role: 'assistant',
        content,
        reasoning: reasoning || undefined,
        model: assistantModel,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      })
      continue
    }

    if (message.role === 'tool' && Array.isArray(message.content)) {
      const toolResults: ToolResult[] = []

      for (const part of message.content) {
        if (part.type !== 'tool-result')
          continue
        const decoded = decodeToolOutput(part.output as { type: string, value?: unknown, reason?: string })
        toolResults.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: decoded.result,
          isError: decoded.isError,
        })
      }

      if (toolResults.length === 0)
        continue

      dbInputs.push({
        role: 'tool',
        content: '',
        toolResults,
      })
    }
  }

  for (let i = dbInputs.length - 1; i >= 0; i--) {
    if (dbInputs[i]?.role === 'assistant') {
      dbInputs[i] = {
        ...dbInputs[i]!,
        usage,
      }
      break
    }
  }

  return dbInputs
}

/**
 * 将数据库 Message 记录转换为 AI SDK 的 ModelMessage[]
 */
function dbMessagesToModelMessages(dbMsgs: Array<{
  role: string
  content: string
  attachments?: MessageImageAttachment[] | null
  reasoning?: string | null
  toolCalls?: unknown[] | null
  toolResults?: unknown[] | null
}>): ModelMessage[] {
  const result: ModelMessage[] = []
  for (const msg of dbMsgs) {
    switch (msg.role) {
      case 'user':
        result.push(createUserMessage(msg.content, msg.attachments ?? undefined))
        break
      case 'assistant': {
        const assistantMessage = buildAssistantMessageFromDbMessage(msg)
        if (assistantMessage)
          result.push(assistantMessage)
        break
      }
      case 'tool': {
        const toolMessage = buildToolMessageFromDbMessage(msg)
        if (toolMessage)
          result.push(toolMessage)
        break
      }
      case 'system':
        result.push({ role: 'system', content: msg.content })
        break
    }
  }
  return normalizeToolCallMessageSequence(result)
}

interface PlanSnapshot {
  filename: string
  filePath: string
}

type PlanBindingPayload = ChatRequest['planBinding']

const PLANS_BASE_DIR = join(homedir(), '.local', 'share', 'locus-agent', 'coding-plans')

function normalizeProjectKey(projectKey?: string): string | null {
  const key = projectKey?.trim()
  if (!key)
    return null
  const safe = key.replace(RE_NON_WORD_OR_HYPHEN, '_')
  return safe.length > 0 ? safe : null
}

function getPlansDir(projectKey?: string): string {
  const normalized = normalizeProjectKey(projectKey)
  if (!normalized)
    return join(PLANS_BASE_DIR, 'global')
  return join(PLANS_BASE_DIR, normalized)
}

function extractLatestPlanFromDbMessages(
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

function resolvePlanSnapshot(
  binding: PlanBindingPayload | undefined,
  dbMsgs: Array<{ toolCalls?: unknown[] | null }>,
  projectKey?: string,
): PlanSnapshot | null {
  if (binding?.mode === 'none')
    return null

  return extractLatestPlanFromDbMessages(dbMsgs, projectKey)
}

function buildPlanInjectedMessage(message: string, plan: PlanSnapshot): string {
  const stripped = message
    .replace(RE_PLAN_TAG, '')
    .replace(RE_PLAN_REF_TAG, '')
    .trim()
  return `${stripped}\n\n<plan_ref>\nfilename: ${plan.filename}\npath: ${plan.filePath}\nread_with: read_plan(action=\"read\", filename=\"${plan.filename}\")\n</plan_ref>`
}

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
  if (activeAbortControllers.has(conversationId)) {
    cleanupSession(conversationId)
  }

  // 创建新的会话状态
  const abortController = new AbortController()
  activeAbortControllers.set(conversationId, abortController)

  // 可变 confirmMode 状态，approve 端点收到 switchToYolo 时会实时更新
  const confirmModeState = { value: confirmMode ?? config.confirmMode }
  activeConfirmModes.set(conversationId, confirmModeState)

  // 记录会话创建时间戳，用于超时清理
  activeSessionTimestamps.set(conversationId, Date.now())

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
