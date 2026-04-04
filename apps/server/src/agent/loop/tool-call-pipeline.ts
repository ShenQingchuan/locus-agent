import type { DelegateArgs, DelegateResult } from '@univedge/locus-agent-sdk'
import type { QuestionItem } from '../tools/ask_question.js'
import type { ExecuteToolPipelineOptions, ExecuteToolPipelineResult } from './types.js'
import { BuiltinTool, classifyTool, HookEvent } from '@univedge/locus-agent-sdk'
import { processDecisions } from '@univedge/locus-plugin-kit'
import { hookBus } from '../plugins/index.js'
import { formatQuestionAnswers } from '../tools/ask_question.js'
import { executeDelegate, formatDelegateResult } from '../tools/delegate.js'
import { executeManageTodos, formatManageTodosResult } from '../tools/manage_todos.js'
import { executeToolCall, hasToolExecutor, interactiveTools, isTrustedBuiltinTool } from '../tools/registry.js'
import { serialTools, trustedBuiltinTools } from '../tools/tool-policy.js'
import { isWhitelisted } from '../whitelist.js'
import { withTimeout } from './timeout.js'

async function executeToolWithTimeout(
  toolName: string,
  toolCallId: string,
  args: unknown,
  onToolOutputDelta: ExecuteToolPipelineOptions['onToolOutputDelta'],
  toolContext: ExecuteToolPipelineOptions['toolContext'],
  toolTimeoutMs: number,
): Promise<unknown> {
  const callbacks = onToolOutputDelta
    ? { onOutputDelta: (stream: 'stdout' | 'stderr', delta: string) => onToolOutputDelta(toolCallId, stream, delta) }
    : undefined
  const toolPromise = executeToolCall(toolName, args, callbacks, toolContext)
  return withTimeout(
    toolPromise,
    toolTimeoutMs,
    `Tool "${toolName}" timed out after ${toolTimeoutMs}ms`,
  )
}

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

    const hookScope = {
      space: (toolContext.space ?? 'chat') as 'chat' | 'coding',
      workspaceRoot: toolContext.workspaceRoot,
      projectKey: toolContext.projectKey,
    }

    const toolCategory = classifyTool(tc.toolName, {
      interactive: interactiveTools,
      trusted: trustedBuiltinTools,
      serial: serialTools,
    })

    // Hook: tool:before_execute (Guard — can block or require confirmation)
    if (hookBus.hasHandlers(HookEvent.ToolBeforeExecute)) {
      const decisions = await hookBus.emit(HookEvent.ToolBeforeExecute, {
        toolName: tc.toolName,
        toolCallId: tc.toolCallId,
        args: tc.args,
        toolCategory,
      }, hookScope)
      const processed = processDecisions(decisions)

      if (processed.blocked) {
        return {
          result: `Tool blocked by plugin: ${processed.blocked.reason}`,
          isError: true,
          isInterrupted: false,
        }
      }

      // Plugin requires confirmation — force approval flow regardless of shouldConfirm()
      if (processed.requireConfirmation && getToolApproval) {
        if (onToolPendingApproval) {
          await onToolPendingApproval(tc.toolCallId, tc.toolName, tc.args)
        }
        void (hookBus.hasHandlers(HookEvent.ToolApprovalRequired) && hookBus.emit(HookEvent.ToolApprovalRequired, {
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          args: tc.args,
        }, hookScope))
        const approved = await getToolApproval(tc.toolCallId, tc.toolName, tc.args)
        if (!approved) {
          return { result: 'Tool execution was rejected by user', isError: true, isInterrupted: false }
        }
      }
    }

    const startTime = Date.now()

    /** Fire-and-forget ToolAfterExecute (Enrich) */
    const emitToolAfter = (resultLen: number, err: boolean) => {
      if (hookBus.hasHandlers(HookEvent.ToolAfterExecute)) {
        void hookBus.emit(HookEvent.ToolAfterExecute, {
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          resultLength: resultLen,
          isError: err,
          durationMs: Date.now() - startTime,
        }, hookScope)
      }
    }

    if (interactiveTools.has(tc.toolName)) {
      if (tc.toolName === BuiltinTool.AskQuestion && getQuestionAnswer) {
        const args = tc.args as { questions: QuestionItem[] }
        const questions = args.questions || []

        if (onQuestionPending) {
          await onQuestionPending(tc.toolCallId, questions)
        }

        const answers = await getQuestionAnswer(tc.toolCallId, questions)
        result = formatQuestionAnswers(answers)
        emitToolAfter(typeof result === 'string' ? result.length : JSON.stringify(result).length, false)
      }
      else if (tc.toolName === BuiltinTool.Delegate) {
        const args = tc.args as DelegateArgs
        const delegateDeltas: Array<{ type: string, content: string, toolName?: string, isError?: boolean }> = []

        // Hook: delegate:before_run (Guard)
        if (hookBus.hasHandlers(HookEvent.DelegateBeforeRun)) {
          const decisions = await hookBus.emit(HookEvent.DelegateBeforeRun, {
            agentName: args.agent_name,
            agentType: args.agent_type,
            task: args.task,
            taskId: args.task_id ?? tc.toolCallId,
          }, hookScope)
          const processed = processDecisions(decisions)
          if (processed.blocked) {
            return {
              result: `Delegate blocked by plugin: ${processed.blocked.reason}`,
              isError: true,
              isInterrupted: false,
            }
          }
        }

        const delegateResult: DelegateResult = await executeDelegate(
          args,
          model,
          {
            conversationId,
            space: toolContext.space,
            codingMode: toolContext.codingMode,
            projectKey: toolContext.projectKey,
            workspaceRoot: toolContext.workspaceRoot,
            skillsWorkspaceRoot: toolContext.skillsWorkspaceRoot,
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

        // Hook: delegate:after_run (Enrich, fire-and-forget)
        if (hookBus.hasHandlers(HookEvent.DelegateAfterRun)) {
          void hookBus.emit(HookEvent.DelegateAfterRun, {
            agentName: args.agent_name,
            agentType: args.agent_type,
            taskId: args.task_id ?? tc.toolCallId,
            success: delegateResult.success,
            iterations: delegateResult.iterations,
            usage: delegateResult.usage,
          }, hookScope)
        }

        // Full result (with deltas) for SSE display; compact result for LLM messages
        const pipelineResult: ExecuteToolPipelineResult = {
          result: {
            ...delegateResult,
            deltas: delegateDeltas,
            isSubAgentResult: true,
          },
          contextResult: formatDelegateResult(delegateResult),
          isError: false,
          isInterrupted: false,
        }
        emitToolAfter(JSON.stringify(pipelineResult.result).length, false)
        return pipelineResult
      }
      else {
        throw new Error(`Interactive tool "${tc.toolName}" has no handler configured`)
      }
    }
    else if (tc.toolName === BuiltinTool.ManageTodos) {
      const manageResult = await executeManageTodos(
        tc.args as Parameters<typeof executeManageTodos>[0],
        conversationId,
      )
      const pipelineResult: ExecuteToolPipelineResult = {
        result: manageResult,
        contextResult: formatManageTodosResult(manageResult),
        isError: false,
        isInterrupted: false,
      }
      emitToolAfter(JSON.stringify(manageResult).length, false)
      return pipelineResult
    }
    else if (shouldConfirm() && getToolApproval) {
      const isTrusted = isTrustedBuiltinTool(tc.toolName)
      const whitelistMatch = conversationId
        ? isWhitelisted(conversationId, tc.toolName, tc.args)
        : null

      if (isTrusted || whitelistMatch) {
        result = await executeToolWithTimeout(tc.toolName, tc.toolCallId, tc.args, onToolOutputDelta, toolContext, toolTimeoutMs)
      }
      else {
        if (onToolPendingApproval) {
          await onToolPendingApproval(tc.toolCallId, tc.toolName, tc.args)
        }

        // Hook: tool:approval_required (Observe, fire-and-forget)
        void (hookBus.hasHandlers(HookEvent.ToolApprovalRequired) && hookBus.emit(HookEvent.ToolApprovalRequired, {
          toolName: tc.toolName,
          toolCallId: tc.toolCallId,
          args: tc.args,
        }, hookScope))

        const approved = await getToolApproval(tc.toolCallId, tc.toolName, tc.args)

        if (!approved) {
          isError = true
          result = 'Tool execution was rejected by user'
        }
        else {
          result = await executeToolWithTimeout(tc.toolName, tc.toolCallId, tc.args, onToolOutputDelta, toolContext, toolTimeoutMs)
        }
      }
    }
    else {
      result = await executeToolWithTimeout(tc.toolName, tc.toolCallId, tc.args, onToolOutputDelta, toolContext, toolTimeoutMs)
    }

    emitToolAfter(typeof result === 'string' ? result.length : JSON.stringify(result).length, isError)
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
