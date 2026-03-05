import type { ModelMessage } from 'ai'
import type { AgentLoopOptions, AgentLoopResult, ExecuteToolPipelineResult, PendingToolCall } from './types.js'
import process from 'node:process'
import { streamText } from 'ai'
import { performCompaction, shouldCompact } from '../context/auto-compaction.js'
import { compactToolResults } from '../context/tool-result-cache.js'
import { getCurrentModelInfo } from '../providers/index.js'
import { getMergedToolsForMode } from '../tools/registry.js'
import { interactiveTools } from '../tools/tool-policy.js'
import { getWorkspaceRoot } from '../tools/workspace-root.js'
import { consumeResponseStream } from './stream-consumer.js'
import { executePendingToolCall } from './tool-call-pipeline.js'

/**
 * 需要串行执行的写入类工具（可能产生文件系统冲突）
 */
const SERIAL_TOOLS = new Set<string>([
  'str_replace',
  'write_file',
  'bash',
])

/**
 * 判断一个工具调用是否可以并行执行
 * 交互式工具、写入类工具必须串行
 */
function canRunInParallel(tc: PendingToolCall): boolean {
  if (interactiveTools.has(tc.toolName))
    return false
  if (SERIAL_TOOLS.has(tc.toolName))
    return false
  return true
}

const DEFAULT_SYSTEM_PROMPT = `
You are Locus, a helpful AI assistant, developed by UnivedgeLabs.
When you need to execute commands or interact with the system, use the available tools.

## Parallel Tool Calls

IMPORTANT: When you need to perform multiple independent operations, issue them ALL in a single response.
For example:
- Reading multiple files → call read_file for each file simultaneously
- Searching files and reading a file → call grep + read_file together
- Multiple glob searches → call glob for each pattern simultaneously

This dramatically improves speed. Only use sequential calls when one tool's output is needed as input for another.

## File Editing

str_replace and write_file return the change result or confirmation.
You usually do not need to call read_file after a successful edit.
Only read when the edit failed (e.g. old_string not found) or when you need to continue editing other parts of the file.

## Content Search

Use the \`grep\` tool to search file contents by regex pattern. This is much faster than reading files one by one.
- Use grep to find where a function/class/variable is defined or used
- Use grep with \`include\` to limit search to specific file types
- Combine grep with read_file: first grep to locate, then read_file for full context

## Memory System

You have access to a persistent memory system via save_memory and search_memories tools.

**When to save memories (save_memory):**
- User states a preference (coding style, language, tools, conventions)
- Important project decisions or architecture choices are made
- You learn a lesson from a debugging session or mistake
- The user explicitly asks you to remember something
- Key facts about the user's environment or workflow

**When to search memories (search_memories):**
- At the start of a new task, if the topic might relate to saved preferences or past decisions
- When the user references something you discussed before
- When you need context about the user's project or preferences
- When the user asks "do you remember..." or similar

**Guidelines:**
- Each memory should be concise (1-3 sentences), specific, and factual
- Use multi-level tags like "preference/code-style", "project/my-app", "lesson/debugging"
- Do NOT search memories on every single turn — only when relevant context would help
- Do NOT save trivial or ephemeral information (e.g. "user said hello")

## Todo Tracking

- Use "manage_todos" whenever the user asks for task planning, progress tracking, or a live checklist.
- Keep todo content short, actionable, and outcome-oriented.
- Prefer updating existing todo status ('in_progress' / 'completed') over creating duplicates.
- Use 'list' when you need to verify the latest todo state.

## Sub-agent Delegation

- Prefer reusing an existing sub-task via \`task_id\` when continuing the same thread.
- Create a new sub-task only when the objective is clearly different.
- For broad execution or coordination work, use \`agent_type: general\`.
- For codebase discovery/research, use \`agent_type: explore\`.
- If using \`agent_type: explore\`, keep it read-oriented unless the user explicitly asks to implement.
- When resuming with \`task_id\`, pass only incremental context/task updates instead of repeating all prior context.

## Diagram Generation

When generating diagrams or visual representations:
1. **Primary choice**: Generate Mermaid diagrams, in code block format.
2. Or use ASCII art as fallback.
`

const PLAN_MODE_PROMPT = `
## Plan Mode

You're in **Plan Mode**. Focus on creating clear, actionable implementation plans — not coding.

**Guidelines:**
1. Understand requirements; ask questions if unclear
2. Read relevant code to understand existing architecture
3. Create a structured plan with:
   - Goal summary
   - Files to modify/create
   - Specific changes per file
   - Implementation steps
   - Risks and considerations
4. Use write_plan to save the plan to \`~/.local/share/locus-agent/coding-plans/[project-key-or-global]/[goal]-[6-char-id].md\`
5. After saving the plan, stop and wait for user action (do not start implementation in this turn)

**Prohibited in Plan Mode:**
- Modifying source code (str_replace/write_file only for plan files)
- Skipping planning and implementing directly
- Continuing execution after write_plan in the same turn
`

const BUILD_WITH_PLAN_PROMPT = `
## 执行计划模式

你正在执行一个之前制定的实现计划。请遵循以下原则：
1. 若用户消息包含 <plan_ref>，先用 read_plan 读取对应计划文件，再开始实施
2. 用 manage_todos 将计划步骤转为 todo 项目，完成后逐项标记
3. 按计划指定的顺序实施，除非依赖关系要求调整
4. 完成每个主要步骤后简要汇报
5. 遇到计划未覆盖的问题时，灵活应对并记录偏差
6. 实施变更后验证结果（运行测试、检查输出等）再进入下一步
`

function buildRuntimeContextPrompt(workspaceRoot: string): string {
  return `## Runtime Context

- workspace_root: ${workspaceRoot}
- server_cwd: ${process.cwd()}
- Prefer resolving relative paths from workspace_root.
- Before broad discovery, use tree with limited depth to inspect structure.`
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
    codingMode,
    getToolApproval,
    onQuestionPending,
    getQuestionAnswer,
    conversationId,
    projectKey,
    workspaceRoot: workspaceRootOption,
    onDelegateDelta,
    toolTimeoutMs = 0,
    toolAllowlist,
  } = options

  const shouldConfirm = typeof confirmModeOpt === 'function' ? confirmModeOpt : () => confirmModeOpt
  const messages: ModelMessage[] = [...initialMessages]
  const workspaceRoot = workspaceRootOption || getWorkspaceRoot()
  const toolContext = { conversationId, projectKey, workspaceRoot }

  // 根据 codingMode 扩展 system prompt
  let effectiveSystemPrompt = `${systemPrompt}\n\n${buildRuntimeContextPrompt(workspaceRoot)}`
  if (codingMode === 'plan') {
    effectiveSystemPrompt += `\n\n${PLAN_MODE_PROMPT}`
  }
  else if (codingMode === 'build') {
    const hasPlan = messages.some(
      m => m.role === 'user' && typeof m.content === 'string' && (m.content.includes('<plan>') || m.content.includes('<plan_ref>')),
    )
    if (hasPlan) {
      effectiveSystemPrompt += `\n\n${BUILD_WITH_PLAN_PROMPT}`
    }
  }

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let iterations = 0
  let finalText = ''
  let finishReason = 'unknown'

  while (iterations < maxIterations) {
    iterations++

    if (abortSignal?.aborted) {
      finishReason = 'aborted'
      break
    }

    // Microcompaction: 将旧的大型工具结果缓存到磁盘，只保留引用
    compactToolResults(messages)

    let response
    let retryCount = 0
    const maxRetries = 2
    const tools = getMergedToolsForMode(codingMode, toolAllowlist)

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

    const usage = await response.usage
    totalInputTokens += usage.inputTokens ?? 0
    totalOutputTokens += usage.outputTokens ?? 0

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

    const responseData = await response.response
    const responseMessages = responseData.messages ?? []

    if (streamResult.pendingToolCalls.length > 0) {
      messages.push(...responseMessages)

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

        const resultText = pipelineResult.contextResult
          ?? (typeof pipelineResult.result === 'string'
            ? pipelineResult.result
            : JSON.stringify(pipelineResult.result))

        return {
          role: 'tool' as const,
          content: [{
            type: 'tool-result' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: pipelineResult.isError
              ? { type: 'error-text' as const, value: resultText }
              : { type: 'text' as const, value: resultText },
          }],
        }
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

      // 1. 并行执行所有可并行的只读工具
      if (parallelBatch.length > 0) {
        const parallelResults = await Promise.all(
          parallelBatch.map(tc =>
            executePendingToolCall({ pendingToolCall: tc, ...pipelineOpts })
              .then(result => ({ tc, result })),
          ),
        )

        for (const { tc, result } of parallelResults) {
          const msg = await handleToolResult(tc, result)
          messages.push(msg)
        }
      }

      // 2. 串行执行写入类和交互式工具
      for (const tc of serialQueue) {
        const pipelineResult = await executePendingToolCall({ pendingToolCall: tc, ...pipelineOpts })

        const msg = await handleToolResult(tc, pipelineResult)
        messages.push(msg)

        if (tc.toolName === 'plan_exit' && !pipelineResult.isError) {
          finishReason = 'end_turn'
          break
        }

        if (codingMode === 'plan' && tc.toolName === 'write_plan' && !pipelineResult.isError) {
          finishReason = 'end_turn'
          break
        }
      }

      if (finishReason === 'end_turn')
        break
      continue
    }

    if (responseMessages.length > 0) {
      messages.push(...responseMessages)
    }

    if (finishReason === 'stop' || finishReason === 'end_turn' || finishReason === 'length') {
      break
    }
    break
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
  }
}
