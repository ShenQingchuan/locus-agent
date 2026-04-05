import type { PendingToolCall } from '@univedge/locus-agent-sdk'
import type { ModelMessage } from 'ai'
import type { AgentLoopOptions, AgentLoopResult, ExecuteToolPipelineResult } from './types.js'
import { BuiltinTool, HookEvent } from '@univedge/locus-agent-sdk'
import { processDecisions } from '@univedge/locus-plugin-kit'
import { streamText } from 'ai'
import { performCompaction, shouldCompact } from '../context/auto-compaction.js'
import { compactToolResults } from '../context/tool-result-cache.js'
import { mcpManager } from '../mcp/manager.js'
import { hookBus } from '../plugins/index.js'
import {
  BUILD_WITH_PLAN_PROMPT,
  buildMemoryTagsPrompt,
  buildRuntimeContextPrompt,
  buildSkillsCatalogPrompt,
  DEFAULT_SYSTEM_PROMPT,
  PLAN_MODE_PROMPT,
} from '../prompts/index.js'
import { getCurrentModelInfo } from '../providers/index.js'
import { getMergedToolsForContext } from '../tools/registry.js'
import { sequentialInteractiveTools, serialTools } from '../tools/tool-policy.js'
import { getWorkspaceRoot } from '../tools/workspace-root.js'
import { buildAssistantStepMessage, buildToolResultMessage, normalizeToolCallMessageSequence } from './message-utils.js'
import { consumeResponseStream } from './stream-consumer.js'
import { executePendingToolCall } from './tool-call-pipeline.js'

/**
 * Whether a tool call can run concurrently with others.
 * - sequentialInteractiveTools (AskQuestion): user can only answer one prompt at a time → serial
 * - serialTools (bash, str_replace, write_file): filesystem mutations → serial
 * - everything else (including Delegate): parallel
 */
function canRunInParallel(tc: PendingToolCall): boolean {
  if (sequentialInteractiveTools.has(tc.toolName))
    return false
  if (serialTools.has(tc.toolName))
    return false
  return true
}

const DEFAULT_TOOL_TIMEOUT_MS = 90_000

/** Max number of tool calls that may run concurrently within a single parallel batch. */
const PARALLEL_TOOL_CONCURRENCY = 3

/**
 * Run tasks concurrently up to `concurrency` at a time, preserving result order.
 * Works like Promise.all but with a concurrency ceiling.
 */
async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  if (items.length === 0)
    return []
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

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
    maxIterations = 500,
    abortSignal,
    confirmMode: confirmModeOpt = false,
    thinkingMode = true,
    space = 'chat',
    codingMode,
    getToolApproval,
    onQuestionPending,
    getQuestionAnswer,
    conversationId,
    projectKey,
    workspaceRoot: workspaceRootOption,
    onDelegateDelta,
    toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS,
    toolAllowlist,
  } = options

  // Proactively wake up any sleeping MCP servers at the start of each top-level
  // agent loop so tools are ready before the LLM's first tool call. Sub-agent
  // loops (which receive an explicit toolAllowlist) skip this to avoid churn.
  if (!toolAllowlist || toolAllowlist.length === 0) {
    mcpManager.reconnectDisconnected()
  }

  const shouldConfirm = typeof confirmModeOpt === 'function' ? confirmModeOpt : () => confirmModeOpt
  const messages: ModelMessage[] = [...initialMessages]
  const generatedMessages: ModelMessage[] = []
  const workspaceRoot = workspaceRootOption || getWorkspaceRoot()
  const toolContext = {
    conversationId,
    space,
    codingMode,
    projectKey,
    workspaceRoot,
    skillsWorkspaceRoot: workspaceRootOption,
  }

  // 根据 codingMode 扩展 system prompt
  let effectiveSystemPrompt = `${systemPrompt}\n\n${buildRuntimeContextPrompt(workspaceRoot)}`
  const [skillsCatalogPrompt, memoryTagsPrompt] = await Promise.all([
    buildSkillsCatalogPrompt(workspaceRootOption),
    buildMemoryTagsPrompt(),
  ])
  const hasAvailableSkills = skillsCatalogPrompt.length > 0
  if (skillsCatalogPrompt) {
    effectiveSystemPrompt += `\n\n${skillsCatalogPrompt}`
  }
  if (memoryTagsPrompt) {
    effectiveSystemPrompt += `\n\n${memoryTagsPrompt}`
  }
  if (space === 'coding' && codingMode === 'plan') {
    effectiveSystemPrompt += `\n\n${PLAN_MODE_PROMPT}`
  }
  else if (space === 'coding' && codingMode === 'build') {
    const hasPlan = messages.some(
      m => m.role === 'user' && typeof m.content === 'string' && (m.content.includes('<plan>') || m.content.includes('<plan_ref>')),
    )
    if (hasPlan) {
      effectiveSystemPrompt += `\n\n${BUILD_WITH_PLAN_PROMPT}`
    }
  }

  const hookScope = {
    space,
    workspaceRoot,
    projectKey,
  }
  let totalToolCallCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterations = 0
  let finalText = ''
  let finishReason = 'unknown'

  try {
    while (iterations < maxIterations) {
      iterations++

      if (abortSignal?.aborted) {
        finishReason = 'aborted'
        break
      }

      const normalizedMessages = normalizeToolCallMessageSequence(messages)
      messages.length = 0
      messages.push(...normalizedMessages)

      // Microcompaction: 将旧的大型工具结果缓存到磁盘，只保留引用
      compactToolResults(messages)

      let response
      let retryCount = 0
      const maxRetries = 2
      const tools = getMergedToolsForContext(space, codingMode, toolAllowlist)
      if (!hasAvailableSkills) {
        delete tools.skill
      }

      // Hook: model:before_call (guard — can block or patch prompt)
      if (hookBus.hasHandlers(HookEvent.ModelBeforeCall)) {
        const decisions = await hookBus.emit(HookEvent.ModelBeforeCall, {
          systemPrompt: effectiveSystemPrompt,
          messageCount: messages.length,
          iteration: iterations,
          toolCount: Object.keys(tools).length,
        }, hookScope)
        const processed = processDecisions(decisions)
        if (processed.blocked) {
          throw new Error(`Blocked by plugin: ${processed.blocked.reason}`)
        }
        for (const patch of processed.promptPatches) {
          if (patch.action === 'append' && patch.content) {
            effectiveSystemPrompt += `\n${patch.content}`
          }
          else if (patch.action === 'prepend' && patch.content) {
            effectiveSystemPrompt = `${patch.content}\n${effectiveSystemPrompt}`
          }
        }
      }

      while (retryCount <= maxRetries) {
        try {
          response = await streamText({
            model,
            system: effectiveSystemPrompt,
            messages,
            tools,
            abortSignal,
            timeout: {
              totalMs: 600_000,
              chunkMs: 90_000,
            },
            ...(thinkingMode
              ? {
                  providerOptions: {
                  // 首轮迭代给予充分思考预算，后续迭代（多为工具结果处理）降低预算提速
                    anthropic: { thinking: { type: 'enabled', budgetTokens: iterations <= 1 ? 10000 : 4000 } },
                    moonshotai: { thinking: { type: 'enabled', budgetTokens: iterations <= 1 ? 10000 : 4000 } },
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

          if (abortSignal?.aborted) {
            throw error
          }

          if (retryCount > maxRetries) {
            throw new Error(`API 请求失败 (已重试 ${maxRetries} 次): ${errorMessage}`)
          }

          console.error(`API 请求失败，${retryCount}/${maxRetries} 次重试: ${errorMessage}`)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
        }
      }

      if (!response) {
        throw new Error('API 请求失败：无法获取响应')
      }

      const streamResult = await consumeResponseStream({
        response,
        abortSignal,
        initialFinishReason: finishReason,
        onReasoningDelta,
        onTextDelta,
        onToolCallStart,
      })
      finishReason = streamResult.finishReason
      totalToolCallCount += streamResult.pendingToolCalls.length

      const usage = await response.usage
      totalInputTokens += usage.inputTokens ?? 0
      totalOutputTokens += usage.outputTokens ?? 0

      // Hook: model:after_call (enrich)
      if (hookBus.hasHandlers(HookEvent.ModelAfterCall)) {
        await hookBus.emit(HookEvent.ModelAfterCall, {
          finishReason,
          usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) },
          toolCallCount: streamResult.pendingToolCalls.length,
          textLength: streamResult.iterationText.length,
        }, hookScope)
      }

      // Auto compaction: 上下文接近上限时自动压缩
      const lastInputTokens = usage.inputTokens ?? 0
      const contextWindow = getCurrentModelInfo().contextWindow
      if (shouldCompact(lastInputTokens, contextWindow)) {
        const compactionResult = await performCompaction(messages, model)
        if (compactionResult.didCompact) {
          console.warn(
            `[agent-loop] Auto-compacted: removed ${compactionResult.messagesRemoved} old messages, `
            + `input was ${lastInputTokens}/${contextWindow} tokens`,
          )
        }
      }

      finalText += streamResult.iterationText
      const assistantMessage = buildAssistantStepMessage({
        text: streamResult.iterationText,
        reasoning: streamResult.iterationReasoning,
        pendingToolCalls: streamResult.pendingToolCalls,
      })

      if (streamResult.pendingToolCalls.length > 0) {
        if (assistantMessage) {
          messages.push(assistantMessage)
          generatedMessages.push(assistantMessage)
        }

        // 将工具调用分为可并行组和串行组
        const parallelBatch: PendingToolCall[] = []
        const serialQueue: PendingToolCall[] = []

        for (const tc of streamResult.pendingToolCalls) {
          if (canRunInParallel(tc)) {
            parallelBatch.push(tc)
          }
          else {
            serialQueue.push(tc)
          }
        }

        // 辅助函数：处理单个工具调用结果并推入 messages
        const handleToolResult = async (tc: PendingToolCall, pipelineResult: ExecuteToolPipelineResult) => {
          if (onToolCallResult) {
            await onToolCallResult(
              tc.toolCallId,
              tc.toolName,
              pipelineResult.result,
              pipelineResult.isError,
              pipelineResult.isInterrupted,
            )
          }

          return buildToolResultMessage(tc, pipelineResult)
        }

        const pipelineOpts = {
          model,
          shouldConfirm,
          abortSignal,
          getToolApproval,
          onToolPendingApproval,
          onToolOutputDelta,
          onQuestionPending,
          getQuestionAnswer,
          onDelegateDelta,
          conversationId,
          toolContext,
          toolTimeoutMs,
        }

        // 1. 并行执行所有可并行的只读工具（并发上限 PARALLEL_TOOL_CONCURRENCY）
        if (parallelBatch.length > 0) {
          const parallelResults = await concurrentMap(
            parallelBatch,
            tc => executePendingToolCall({ pendingToolCall: tc, ...pipelineOpts })
              .then(result => ({ tc, result })),
            PARALLEL_TOOL_CONCURRENCY,
          )

          const toolMessages = await Promise.all(
            parallelResults.map(({ tc, result }) => handleToolResult(tc, result)),
          )
          messages.push(...toolMessages)
          generatedMessages.push(...toolMessages)
        }

        // 2. 串行执行写入类和交互式工具
        for (const tc of serialQueue) {
          const pipelineResult = await executePendingToolCall({ pendingToolCall: tc, ...pipelineOpts })

          const msg = await handleToolResult(tc, pipelineResult)
          messages.push(msg)
          generatedMessages.push(msg)

          if (tc.toolName === BuiltinTool.PlanExit && !pipelineResult.isError) {
            finishReason = 'end_turn'
            break
          }

          if (codingMode === 'plan' && tc.toolName === BuiltinTool.WritePlan && !pipelineResult.isError) {
            finishReason = 'end_turn'
            break
          }
        }

        if (finishReason === 'end_turn')
          break
        continue
      }

      if (assistantMessage) {
        messages.push(assistantMessage)
        generatedMessages.push(assistantMessage)
      }

      if (finishReason === 'stop' || finishReason === 'end_turn' || finishReason === 'length') {
        break
      }
      break
    }
  }
  catch (error) {
    // Hook: run:error (observe)
    if (hookBus.hasHandlers(HookEvent.RunError)) {
      await hookBus.emit(HookEvent.RunError, {
        error: error instanceof Error ? error.message : String(error),
        iteration: iterations,
      }, hookScope)
    }
    throw error
  }

  // Hook: run:finish (observe)
  if (hookBus.hasHandlers(HookEvent.RunFinish)) {
    await hookBus.emit(HookEvent.RunFinish, {
      finishReason,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalInputTokens + totalOutputTokens },
      iterations,
      toolCallCount: totalToolCallCount,
    }, hookScope)
  }

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
    messages,
    generatedMessages,
  }
}
