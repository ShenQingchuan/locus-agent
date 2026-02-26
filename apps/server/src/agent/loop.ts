import type { LanguageModel, ModelMessage } from 'ai'
import type { QuestionAnswer, QuestionItem } from './tools/ask_question.js'
import type { DelegateArgs, DelegateResult } from './tools/delegate.js'
import { streamText } from 'ai'
import { formatQuestionAnswers } from './tools/ask_question.js'
import { executeDelegate } from './tools/delegate.js'
import { executeToolCall, getMergedTools, hasToolExecutor, interactiveTools } from './tools/registry.js'
import { isWhitelisted } from './whitelist.js'

/**
 * Agent Loop 配置选项
 */
export interface AgentLoopOptions {
  /** 消息历史 */
  messages: ModelMessage[]
  /** 系统提示词 */
  systemPrompt?: string
  /** 语言模型实例 */
  model: LanguageModel
  /** 文本增量回调 */
  onTextDelta?: (delta: string) => void | Promise<void>
  /** 工具调用开始回调 */
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  /** 工具调用结果回调 */
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => void | Promise<void>
  /** 思考过程增量回调 */
  onReasoningDelta?: (delta: string) => void | Promise<void>
  /** 工具等待确认回调（确认模式下使用） */
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  /** 工具执行过程中的流式输出回调（如 bash 的 stdout/stderr） */
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  /** 完成回调 */
  onFinish?: (finishReason: string, usage: { inputTokens: number, outputTokens: number }) => void | Promise<void>
  /** 最大迭代次数 */
  maxIterations?: number
  /** AbortSignal 用于取消 */
  abortSignal?: AbortSignal
  /** 确认模式：true = 需要确认，false = yolo 模式；支持函数形式以便运行期间动态变更 */
  confirmMode?: boolean | (() => boolean)
  /** 是否启用思考模式（默认 true） */
  thinkingMode?: boolean
  /** 获取工具确认结果的函数（确认模式下使用） */
  getToolApproval?: (toolCallId: string, toolName: string, args: unknown) => Promise<boolean>
  /** 提问等待回答回调（ask_question 工具使用） */
  onQuestionPending?: (toolCallId: string, questions: QuestionItem[]) => void | Promise<void>
  /** 获取用户对提问的回答（ask_question 工具使用） */
  getQuestionAnswer?: (toolCallId: string, questions: QuestionItem[]) => Promise<QuestionAnswer[]>
  /** 会话 ID（用于白名单匹配） */
  conversationId?: string
  /** Delegate 子代理状态流式回调（delegate 工具使用） */
  onDelegateDelta?: (toolCallId: string, delta: { type: 'text' | 'reasoning' | 'tool_start' | 'tool_result', content: string, toolName?: string, isError?: boolean }) => void | Promise<void>
  /** 工具调用超时时间（毫秒），未设置则使用默认超时 */
  toolTimeoutMs?: number
}

/**
 * Agent Loop 结果
 */
export interface AgentLoopResult {
  /** 最终文本响应 */
  text: string
  /** 完成原因 */
  finishReason: string
  /** Token 使用统计 */
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  /** 迭代次数 */
  iterations: number
}

/**
 * 默认系统提示词
 */
const DEFAULT_SYSTEM_PROMPT = `
You are a helpful AI assistant named Locus, developed by UnivedgeLabs, with access to tools.
When you need to execute commands or interact with the system, use the available tools.
Always explain what you're doing and why before using a tool.
After getting tool results, analyze them and provide a clear response to the user.

File editing: str_replace and write_file return the change result or confirmation. 
You usually do not need to call read_file after a successful edit.
Only read when the edit failed (e.g. old_string not found) or when you need to continue editing other parts of the file.
`

/**
 * 运行 Agent Loop
 * 循环执行 AI 调用和工具调用，直到完成或达到最大迭代次数
 */
/**
 * 带超时的 Promise 包装器
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  if (timeoutMs <= 0)
    return promise

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    }),
  ])
}

/**
 * 运行 Agent Loop
 * 循环执行 AI 调用和工具调用，直到完成或达到最大迭代次数
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    messages: initialMessages,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    model,
    onTextDelta,
    onToolCallStart,
    onToolCallResult,
    onReasoningDelta,
    onToolPendingApproval,
    onToolOutputDelta,
    onFinish,
    maxIterations = 10,
    abortSignal,
    confirmMode: confirmModeOpt = false,
    thinkingMode = true,
    getToolApproval,
    onQuestionPending,
    getQuestionAnswer,
    conversationId,
    onDelegateDelta,
    toolTimeoutMs = 0, // 0 表示不设置超时
  } = options

  const shouldConfirm = typeof confirmModeOpt === 'function' ? confirmModeOpt : () => confirmModeOpt

  // 复制消息数组以避免修改原始数组
  const messages: ModelMessage[] = [...initialMessages]
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterations = 0
  let finalText = ''
  let finishReason = 'unknown'

  while (iterations < maxIterations) {
    iterations++

    // 检查是否被取消
    if (abortSignal?.aborted) {
      finishReason = 'aborted'
      break
    }

    // 调用 AI（带重试）
    let response
    let retryCount = 0
    const maxRetries = 2

    while (retryCount <= maxRetries) {
      try {
        response = await streamText({
          model,
          system: systemPrompt,
          messages,
          tools: getMergedTools(),
          abortSignal,
          timeout: {
            totalMs: 600_000,
            chunkMs: 90_000,
          },
          ...(thinkingMode
            ? {
                providerOptions: {
                  anthropic: { thinking: { type: 'enabled', budgetTokens: 10000 } },
                  moonshotai: { thinking: { type: 'enabled', budgetTokens: 10000 } },
                  deepseek: { thinking: { type: 'enabled' } },
                },
              }
            : {}),
        })
        break
      }
      catch (error) {
        retryCount++
        const errorMessage = error instanceof Error ? error.message : String(error)

        // 如果是取消请求，直接抛出
        if (abortSignal?.aborted) {
          throw error
        }

        // 如果达到最大重试次数，抛出错误
        if (retryCount > maxRetries) {
          throw new Error(`API 请求失败 (已重试 ${maxRetries} 次): ${errorMessage}`)
        }

        // 等待一段时间后重试
        console.error(`API 请求失败，${retryCount}/${maxRetries} 次重试: ${errorMessage}`)
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
      }
    }

    if (!response) {
      throw new Error('API 请求失败：无法获取响应')
    }

    // 收集本次迭代的文本
    let iterationText = ''
    let pendingToolCall: {
      toolCallId: string
      toolName: string
      args: unknown
    } | null = null
    const seenToolCallIds = new Set<string>()

    // 处理流式响应
    for await (const part of response.fullStream) {
      if (abortSignal?.aborted) {
        finishReason = 'aborted'
        break
      }

      switch (part.type) {
        case 'reasoning-delta':
          if (onReasoningDelta) {
            await onReasoningDelta((part as any).text)
          }
          break

        case 'text-delta':
          iterationText += part.text
          if (onTextDelta) {
            await onTextDelta(part.text)
          }
          break

        case 'tool-call':
          if (seenToolCallIds.has(part.toolCallId)) {
            console.warn(`[agent-loop] Duplicate tool-call event ignored: ${part.toolCallId}`)
            break
          }
          seenToolCallIds.add(part.toolCallId)
          // 只保留第一个工具调用，后续的忽略（将在下一轮处理）
          if (!pendingToolCall) {
            pendingToolCall = {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
            }
            if (onToolCallStart) {
              await onToolCallStart(part.toolCallId, part.toolName, part.input)
            }
          }
          break

        case 'finish':
          finishReason = part.finishReason
          break

        case 'error':
          throw new Error(String(part.error))
      }
    }

    // 获取使用统计
    const usage = await response.usage
    totalInputTokens += usage.inputTokens ?? 0
    totalOutputTokens += usage.outputTokens ?? 0

    // 累积最终文本
    finalText += iterationText

    const responseData = await response.response
    const responseMessages = responseData.messages ?? []

    if (pendingToolCall) {
      const tc = pendingToolCall
      messages.push(...responseMessages)

      // 执行工具
      let result: unknown
      let isError = false
      let isInterrupted = false

      try {
        // 检查是否已被中断
        if (abortSignal?.aborted) {
          isInterrupted = true
          throw new Error('Tool execution was interrupted')
        }

        if (!hasToolExecutor(tc.toolName)) {
          throw new Error(`Unknown tool: ${tc.toolName}`)
        }

        // 交互式工具（如 ask_question、delegate）走特殊流程
        if (interactiveTools.has(tc.toolName)) {
          if (tc.toolName === 'ask_question' && getQuestionAnswer) {
            const args = tc.args as { questions: QuestionItem[] }
            const questions = args.questions || []

            // 通知前端显示提问卡片
            if (onQuestionPending) {
              await onQuestionPending(tc.toolCallId, questions)
            }

            // 等待用户回答
            const answers = await getQuestionAnswer(tc.toolCallId, questions)

            // 格式化回答
            result = formatQuestionAnswers(answers)
          }
          else if (tc.toolName === 'delegate') {
            const args = tc.args as DelegateArgs

            // 收集 delegate 执行过程中的 deltas（用于持久化存储）
            const delegateDeltas: Array<{ type: string, content: string, toolName?: string, isError?: boolean }> = []

            // 执行 delegate，使用当前相同的模型，传递流式状态回调
            const delegateResult: DelegateResult = await executeDelegate(
              args,
              model,
              onDelegateDelta
                ? {
                    onTextDelta: async (delta) => {
                      const d = { type: 'text' as const, content: delta }
                      delegateDeltas.push(d)
                      await onDelegateDelta(tc.toolCallId, d)
                    },
                    onReasoningDelta: async (delta) => {
                      const d = { type: 'reasoning' as const, content: delta }
                      delegateDeltas.push(d)
                      await onDelegateDelta(tc.toolCallId, d)
                    },
                    onToolCallStart: async (_id, toolName, toolArgs) => {
                      const d = {
                        type: 'tool_start' as const,
                        content: JSON.stringify(toolArgs),
                        toolName,
                      }
                      delegateDeltas.push(d)
                      await onDelegateDelta(tc.toolCallId, d)
                    },
                    onToolCallResult: async (_id, toolName, toolResult, isError) => {
                      const d = {
                        type: 'tool_result' as const,
                        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                        toolName,
                        isError,
                      }
                      delegateDeltas.push(d)
                      await onDelegateDelta(tc.toolCallId, d)
                    },
                  }
                : undefined,
            )

            // 返回包含 deltas 和独立 token 统计的结果
            // 注意：子代理的 token 不计入主会话上下文
            result = {
              ...delegateResult,
              deltas: delegateDeltas,
              // 标记这是子代理结果，其 token 已单独统计
              isSubAgentResult: true,
            }

            // 子代理 token 由其独立的 runAgentLoop 统计，
            // 不在主循环的 totalInputTokens/totalOutputTokens 中，无需减除
          }
          else {
            throw new Error(`Interactive tool "${tc.toolName}" has no handler configured`)
          }
        }
        // 确认模式下，检查白名单后决定是否等待用户确认
        else if (shouldConfirm() && getToolApproval) {
          // 白名单检查：如果匹配则自动放行
          const whitelistMatch = conversationId
            ? isWhitelisted(conversationId, tc.toolName, tc.args)
            : null

          if (whitelistMatch) {
            // 白名单命中，自动放行（应用超时）
            const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
              ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
              : undefined)
            result = await withTimeout(
              toolPromise,
              toolTimeoutMs,
              `Tool "${tc.toolName}" timed out after ${toolTimeoutMs}ms`,
            )
          }
          else {
            // 未命中白名单，需要用户确认
            if (onToolPendingApproval) {
              await onToolPendingApproval(tc.toolCallId, tc.toolName, tc.args)
            }

            const approved = await getToolApproval(tc.toolCallId, tc.toolName, tc.args)

            if (!approved) {
              isError = true
              result = 'Tool execution was rejected by user'
            }
            else {
              // 用户确认后执行（应用超时）
              const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
                ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
                : undefined)
              result = await withTimeout(
                toolPromise,
                toolTimeoutMs,
                `Tool "${tc.toolName}" timed out after ${toolTimeoutMs}ms`,
              )
            }
          }
        }
        else {
          // 普通执行模式（应用超时）
          const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
            ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
            : undefined)
          result = await withTimeout(
            toolPromise,
            toolTimeoutMs,
            `Tool "${tc.toolName}" timed out after ${toolTimeoutMs}ms`,
          )
        }
      }
      catch (error) {
        isError = true
        result = error instanceof Error ? error.message : String(error)
      }

      if (onToolCallResult) {
        await onToolCallResult(tc.toolCallId, tc.toolName, result, isError, isInterrupted)
      }

      const resultText = typeof result === 'string' ? result : JSON.stringify(result)

      // 添加工具结果消息
      messages.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: isError
            ? { type: 'error-text', value: resultText }
            : { type: 'text', value: resultText },
        }],
      })

      // 继续循环让 AI 处理工具结果
      continue
    }

    if (responseMessages.length > 0) {
      messages.push(...responseMessages)
    }

    // 检查完成原因
    if (finishReason === 'stop' || finishReason === 'end_turn' || finishReason === 'length') {
      break
    }

    // 其他原因也退出循环
    break
  }

  // 调用完成回调
  if (onFinish) {
    await onFinish(finishReason, {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    })
  }

  return {
    text: finalText,
    finishReason,
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    },
    iterations,
  }
}
