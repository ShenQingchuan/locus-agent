import type { QuestionItem } from '../tools/ask_question.js'
import type { DelegateArgs, DelegateResult } from '../tools/delegate.js'
import type { ExecuteToolPipelineOptions, ExecuteToolPipelineResult } from './types.js'
import { formatQuestionAnswers } from '../tools/ask_question.js'
import { executeDelegate, formatDelegateResult } from '../tools/delegate.js'
import { executeManageTodos, formatManageTodosResult } from '../tools/manage_todos.js'
import { executeToolCall, hasToolExecutor, interactiveTools, isTrustedBuiltinTool } from '../tools/registry.js'
import { isWhitelisted } from '../whitelist.js'
import { withTimeout } from './timeout.js'

export async function executePendingToolCall(
  options: ExecuteToolPipelineOptions,
): Promise<ExecuteToolPipelineResult> {
  const {
    pendingToolCall: tc,
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
  } = options

  let result: unknown
  let isError = false
  let isInterrupted = false

  try {
    if (abortSignal?.aborted) {
      isInterrupted = true
      throw new Error('Tool execution was interrupted')
    }

    if (!hasToolExecutor(tc.toolName)) {
      throw new Error(`Unknown tool: ${tc.toolName}`)
    }

    if (interactiveTools.has(tc.toolName)) {
      if (tc.toolName === 'ask_question' && getQuestionAnswer) {
        const args = tc.args as { questions: QuestionItem[] }
        const questions = args.questions || []

        if (onQuestionPending) {
          await onQuestionPending(tc.toolCallId, questions)
        }

        const answers = await getQuestionAnswer(tc.toolCallId, questions)
        result = formatQuestionAnswers(answers)
      }
      else if (tc.toolName === 'plan_exit' && getQuestionAnswer) {
        const question = '计划已完成，是否切换到 Build 模式并开始执行？'
        const questions: QuestionItem[] = [{
          question,
          options: ['切换到 Build', '继续完善 Plan'],
        }]

        if (onQuestionPending) {
          await onQuestionPending(tc.toolCallId, questions)
        }

        const answers = await getQuestionAnswer(tc.toolCallId, questions)
        const answerText = answers[0]?.answer?.trim() ?? ''
        const switchedToBuild = /切换|build|yes|start|执行/i.test(answerText)
          && !/继续|保持|no|否/i.test(answerText)

        result = {
          success: true,
          switchedToBuild,
          message: switchedToBuild
            ? '已确认切换到 Build 模式。'
            : '保持在 Plan 模式。',
        }
      }
      else if (tc.toolName === 'delegate') {
        const args = tc.args as DelegateArgs
        const delegateDeltas: Array<{ type: string, content: string, toolName?: string, isError?: boolean }> = []

        const delegateResult: DelegateResult = await executeDelegate(
          args,
          model,
          {
            conversationId,
            onTextDelta: onDelegateDelta
              ? async (delta) => {
                const d = { type: 'text' as const, content: delta }
                delegateDeltas.push(d)
                await onDelegateDelta(tc.toolCallId, d)
              }
              : undefined,
            onReasoningDelta: onDelegateDelta
              ? async (delta) => {
                const d = { type: 'reasoning' as const, content: delta }
                delegateDeltas.push(d)
                await onDelegateDelta(tc.toolCallId, d)
              }
              : undefined,
            onToolCallStart: onDelegateDelta
              ? async (_id, toolName, toolArgs) => {
                const d = {
                  type: 'tool_start' as const,
                  content: JSON.stringify(toolArgs),
                  toolName,
                }
                delegateDeltas.push(d)
                await onDelegateDelta(tc.toolCallId, d)
              }
              : undefined,
            onToolCallResult: onDelegateDelta
              ? async (_id, toolName, toolResult, isError) => {
                const d = {
                  type: 'tool_result' as const,
                  content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                  toolName,
                  isError,
                }
                delegateDeltas.push(d)
                await onDelegateDelta(tc.toolCallId, d)
              }
              : undefined,
          },
        )

        // 完整结果（含 deltas）发给前端 SSE 展示
        result = {
          ...delegateResult,
          deltas: delegateDeltas,
          isSubAgentResult: true,
        }
        // 精简结果推入 LLM messages，不含庞大的 deltas
        return {
          result,
          contextResult: formatDelegateResult(delegateResult),
          isError: false,
          isInterrupted: false,
        }
      }
      else {
        throw new Error(`Interactive tool "${tc.toolName}" has no handler configured`)
      }
    }
    else if (tc.toolName === 'manage_todos') {
      const manageResult = await executeManageTodos(
        tc.args as Parameters<typeof executeManageTodos>[0],
        conversationId,
      )
      return {
        result: manageResult,
        contextResult: formatManageTodosResult(manageResult),
        isError: false,
        isInterrupted: false,
      }
    }
    else if (shouldConfirm() && getToolApproval) {
      const isTrusted = isTrustedBuiltinTool(tc.toolName)
      const whitelistMatch = conversationId
        ? isWhitelisted(conversationId, tc.toolName, tc.args)
        : null

      if (isTrusted || whitelistMatch) {
        const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
          ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
          : undefined, toolContext)
        result = await withTimeout(
          toolPromise,
          toolTimeoutMs,
          `Tool "${tc.toolName}" timed out after ${toolTimeoutMs}ms`,
        )
      }
      else {
        if (onToolPendingApproval) {
          await onToolPendingApproval(tc.toolCallId, tc.toolName, tc.args)
        }

        const approved = await getToolApproval(tc.toolCallId, tc.toolName, tc.args)

        if (!approved) {
          isError = true
          result = 'Tool execution was rejected by user'
        }
        else {
          const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
            ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
            : undefined, toolContext)
          result = await withTimeout(
            toolPromise,
            toolTimeoutMs,
            `Tool "${tc.toolName}" timed out after ${toolTimeoutMs}ms`,
          )
        }
      }
    }
    else {
      const toolPromise = executeToolCall(tc.toolName, tc.args, onToolOutputDelta
        ? { onOutputDelta: (stream, delta) => onToolOutputDelta(tc.toolCallId, stream, delta) }
        : undefined, toolContext)
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

  return {
    result,
    isError,
    isInterrupted,
  }
}
