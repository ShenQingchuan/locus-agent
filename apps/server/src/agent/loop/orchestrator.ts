import type { ModelMessage } from 'ai'
import type { AgentLoopOptions, AgentLoopResult } from './types.js'
import { streamText } from 'ai'
import { getMergedTools } from '../tools/registry.js'
import { consumeResponseStream } from './stream-consumer.js'
import { executePendingToolCall } from './tool-call-pipeline.js'

const DEFAULT_SYSTEM_PROMPT = `
## Character Setting

You are a helpful AI assistant named Locus, developed by UnivedgeLabs, with access to tools.
When you need to execute commands or interact with the system, use the available tools.
Always explain what you're doing and why before using a tool.
After getting tool results, analyze them and provide a clear response to the user.

File editing: str_replace and write_file return the change result or confirmation. 
You usually do not need to call read_file after a successful edit.
Only read when the edit failed (e.g. old_string not found) or when you need to continue editing other parts of the file.

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

## Diagram Generation

When generating diagrams or visual representations:

1. **Primary choice**: Generate Mermaid diagrams, in code block format.
2. Or use ASCII art as fallback.
`

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
    toolTimeoutMs = 0,
  } = options

  const shouldConfirm = typeof confirmModeOpt === 'function' ? confirmModeOpt : () => confirmModeOpt
  const messages: ModelMessage[] = [...initialMessages]
  const toolContext = { conversationId }

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

    finalText += streamResult.iterationText

    const responseData = await response.response
    const responseMessages = responseData.messages ?? []

    if (streamResult.pendingToolCall) {
      const tc = streamResult.pendingToolCall
      messages.push(...responseMessages)

      const pipelineResult = await executePendingToolCall({
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
      })

      if (onToolCallResult) {
        await onToolCallResult(
          tc.toolCallId,
          tc.toolName,
          pipelineResult.result,
          pipelineResult.isError,
          pipelineResult.isInterrupted,
        )
      }

      const resultText = typeof pipelineResult.result === 'string'
        ? pipelineResult.result
        : JSON.stringify(pipelineResult.result)

      messages.push({
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: pipelineResult.isError
            ? { type: 'error-text', value: resultText }
            : { type: 'text', value: resultText },
        }],
      })
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
  }
}
