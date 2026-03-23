import type {
  SDKPartialAssistantMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKToolProgressMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { DelegateDelta, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import { spawn } from 'node:child_process'
import { query } from '@anthropic-ai/claude-agent-sdk'

export interface LocalClaudeCodeCallbacks {
  onTextDelta?: (delta: string) => void | Promise<void>
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => void | Promise<void>
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
}

export interface RunLocalClaudeCodeOptions extends LocalClaudeCodeCallbacks {
  prompt: string
  attachments?: MessageImageAttachment[]
  conversationId: string
  workspaceRoot: string
  abortSignal?: AbortSignal
}

export interface LocalClaudeCodeResult {
  model?: string
  sessionId?: string
  finishReason: string
  text: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

const LOCAL_CLAUDE_CODE_EXECUTABLE = '/Users/admin/.bun/bin/claude'
const IDLE_TIMEOUT_MS = 5 * 60 * 1000
const RE_BASE64_DATA_URL = /^data:.*?;base64,(.+)$/

/**
 * Build an async iterable prompt containing text + image content blocks
 * for the Claude Agent SDK's `query()`.
 */
async function* buildMultimodalPrompt(
  text: string,
  attachments: MessageImageAttachment[],
  sessionId: string,
): AsyncGenerator<SDKUserMessage> {
  const content: unknown[] = []

  if (text.trim())
    content.push({ type: 'text', text })

  for (const attachment of attachments) {
    const match = attachment.dataUrl.match(RE_BASE64_DATA_URL)
    if (!match?.[1])
      continue
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: attachment.mimeType,
        data: match[1],
      },
    })
  }

  yield {
    type: 'user',
    message: { role: 'user', content } as any,
    parent_tool_use_id: null,
    session_id: sessionId,
  }
}

const sessionIdsByConversation = new Map<string, string>()

interface ActiveToolUse {
  id: string
  name: string
  input?: unknown
}

interface LocalClaudeRuntimeState {
  finalText: string
  finishReason: string
  usage: LocalClaudeCodeResult['usage']
  /** Main-thread tool calls awaiting completion (keyed by content_block index) */
  pendingTools: Map<number, ActiveToolUse>
  /** tool_use_ids identified as sub-agent invocations via task_started */
  subAgentToolIds: Set<string>
}

// ---------------------------------------------------------------------------
// Stream event processing — only uses `stream_event` (no `assistant` message)
// ---------------------------------------------------------------------------

function safeUsage(u: any): LocalClaudeCodeResult['usage'] {
  const input = u?.input_tokens ?? u?.inputTokens ?? 0
  const output = u?.output_tokens ?? u?.outputTokens ?? 0
  return { inputTokens: input, outputTokens: output, totalTokens: input + output }
}

async function completePendingTools(
  state: LocalClaudeRuntimeState,
  callbacks: LocalClaudeCodeCallbacks,
): Promise<void> {
  const remaining: Array<[number, ActiveToolUse]> = []

  for (const [index, toolUse] of state.pendingTools) {
    if (state.subAgentToolIds.has(toolUse.id)) {
      remaining.push([index, toolUse])
      continue
    }
    await callbacks.onToolCallResult?.(toolUse.id, toolUse.name, { status: 'completed' }, false)
  }

  state.pendingTools.clear()
  for (const [index, toolUse] of remaining) {
    state.pendingTools.set(index, toolUse)
  }
}

async function processStreamEvent(
  message: SDKPartialAssistantMessage,
  state: LocalClaudeRuntimeState,
  callbacks: LocalClaudeCodeCallbacks,
): Promise<void> {
  const event = message.event as any
  const isMainThread = message.parent_tool_use_id === null

  if (event.type === 'message_start' && isMainThread) {
    await completePendingTools(state, callbacks)
    return
  }

  if (event.type === 'content_block_start') {
    if (event.content_block?.type === 'tool_use' && isMainThread) {
      const toolUse: ActiveToolUse = {
        id: typeof event.content_block.id === 'string' ? event.content_block.id : crypto.randomUUID(),
        name: typeof event.content_block.name === 'string' ? event.content_block.name : 'unknown',
        input: event.content_block.input,
      }
      state.pendingTools.set(event.index, toolUse)
      await callbacks.onToolCallStart?.(toolUse.id, toolUse.name, toolUse.input ?? {})
    }
    return
  }

  if (event.type === 'content_block_delta') {
    if (!isMainThread)
      return
    if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
      state.finalText += event.delta.text
      await callbacks.onTextDelta?.(event.delta.text)
    }
    else if (event.delta?.type === 'thinking_delta' && typeof event.delta.thinking === 'string') {
      await callbacks.onReasoningDelta?.(event.delta.thinking)
    }
    return
  }

  if (event.type === 'message_delta' && isMainThread) {
    if (event.delta?.stop_reason)
      state.finishReason = event.delta.stop_reason
    if (event.usage)
      state.usage = safeUsage(event.usage)
  }
}

// ---------------------------------------------------------------------------
// Task (sub-agent) lifecycle
// ---------------------------------------------------------------------------

async function emitTaskStarted(
  message: SDKTaskStartedMessage,
  state: LocalClaudeRuntimeState,
  callbacks: LocalClaudeCodeCallbacks,
): Promise<void> {
  if (!message.tool_use_id)
    return

  state.subAgentToolIds.add(message.tool_use_id)

  await callbacks.onDelegateDelta?.(message.tool_use_id, {
    type: 'text',
    content: message.description,
  })
}

async function emitTaskProgress(message: SDKTaskProgressMessage, callbacks: LocalClaudeCodeCallbacks): Promise<void> {
  if (!message.tool_use_id)
    return

  await callbacks.onDelegateDelta?.(message.tool_use_id, {
    type: 'reasoning',
    content: message.summary || message.description,
  })
}

async function emitTaskNotification(
  message: SDKTaskNotificationMessage,
  state: LocalClaudeRuntimeState,
  callbacks: LocalClaudeCodeCallbacks,
): Promise<void> {
  if (!message.tool_use_id)
    return

  await callbacks.onDelegateDelta?.(message.tool_use_id, {
    type: 'tool_result',
    content: message.summary,
    isError: message.status === 'failed',
  })

  const entry = [...state.pendingTools.entries()].find(([, t]) => t.id === message.tool_use_id)
  if (entry) {
    const [index, toolUse] = entry
    await callbacks.onToolCallResult?.(
      toolUse.id,
      toolUse.name,
      { status: message.status, summary: message.summary },
      message.status === 'failed',
    )
    state.pendingTools.delete(index)
    state.subAgentToolIds.delete(message.tool_use_id)
  }
}

// ---------------------------------------------------------------------------
// Tool progress (per-tool execution heartbeats)
// ---------------------------------------------------------------------------

async function emitToolProgress(message: SDKToolProgressMessage, callbacks: LocalClaudeCodeCallbacks): Promise<void> {
  if (message.parent_tool_use_id) {
    await callbacks.onDelegateDelta?.(message.parent_tool_use_id, {
      type: 'tool_start',
      content: `${message.tool_name} (${message.elapsed_time_seconds.toFixed(1)}s)`,
      toolName: message.tool_name,
    })
  }
  else {
    await callbacks.onToolOutputDelta?.(
      message.tool_use_id,
      'stdout',
      `${message.tool_name} (${message.elapsed_time_seconds.toFixed(1)}s)\n`,
    )
  }
}

// ---------------------------------------------------------------------------
// Idle-timeout abort controller
// ---------------------------------------------------------------------------

function createIdleTimeoutController(parentSignal?: AbortSignal): {
  controller: AbortController
  resetIdleTimer: () => void
} {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null

  function resetIdleTimer() {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      controller.abort(new Error(`Local Claude Code idle timeout (${IDLE_TIMEOUT_MS / 1000}s without events)`))
    }, IDLE_TIMEOUT_MS)
  }

  parentSignal?.addEventListener('abort', () => {
    if (timer)
      clearTimeout(timer)
    controller.abort(parentSignal.reason)
  }, { once: true })

  controller.signal.addEventListener('abort', () => {
    if (timer)
      clearTimeout(timer)
  }, { once: true })

  resetIdleTimer()

  return { controller, resetIdleTimer }
}

// ---------------------------------------------------------------------------
// Process spawning
// ---------------------------------------------------------------------------

function spawnLocalClaudeCode(args: string[], cwd: string, env: Record<string, string | undefined>, signal: AbortSignal) {
  const sanitizedArgs: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg.includes('/@anthropic-ai/claude-agent-sdk/cli.js'))
      continue

    if (arg === '--setting-sources') {
      i += 1
      continue
    }

    sanitizedArgs.push(arg)
  }

  return spawn(LOCAL_CLAUDE_CODE_EXECUTABLE, ['-p', ...sanitizedArgs], {
    cwd,
    env,
    signal,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runLocalClaudeCode(options: RunLocalClaudeCodeOptions): Promise<LocalClaudeCodeResult> {
  const existingSessionId = sessionIdsByConversation.get(options.conversationId)
  const { controller: abortController, resetIdleTimer } = createIdleTimeoutController(options.abortSignal)
  let latestModel: string | undefined
  let latestSessionId = existingSessionId

  const state: LocalClaudeRuntimeState = {
    finalText: '',
    finishReason: 'unknown',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    pendingTools: new Map(),
    subAgentToolIds: new Set(),
  }

  const hasAttachments = options.attachments && options.attachments.length > 0
  const prompt = hasAttachments
    ? buildMultimodalPrompt(options.prompt, options.attachments!, existingSessionId ?? '')
    : options.prompt

  const stream = query({
    prompt,
    options: {
      cwd: options.workspaceRoot,
      resume: existingSessionId,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController,
      stderr: (data) => {
        void options.onToolOutputDelta?.('local-claude-code', 'stderr', data)
      },
      spawnClaudeCodeProcess: ({ args, cwd, env, signal }) => {
        return spawnLocalClaudeCode(args, cwd ?? options.workspaceRoot, env, signal)
      },
    },
  })

  try {
    for await (const message of stream) {
      resetIdleTimer()

      switch (message.type) {
        case 'system':
          switch (message.subtype) {
            case 'init':
              latestModel = message.model
              latestSessionId = message.session_id
              break
            case 'task_started':
              await emitTaskStarted(message, state, options)
              break
            case 'task_progress':
              await emitTaskProgress(message, options)
              break
            case 'task_notification':
              await emitTaskNotification(message, state, options)
              break
          }
          break
        case 'stream_event':
          await processStreamEvent(message, state, options)
          break
        case 'tool_progress':
          await emitToolProgress(message, options)
          break
        case 'result': {
          latestSessionId = message.session_id

          for (const [, toolUse] of state.pendingTools) {
            await options.onToolCallResult?.(toolUse.id, toolUse.name, { status: 'completed' }, false)
          }
          state.pendingTools.clear()

          state.finishReason = message.stop_reason ?? (message.is_error ? message.subtype : 'completed')
          state.usage = safeUsage(message.usage)

          const resultText = 'result' in message && typeof message.result === 'string' ? message.result : ''
          if (!state.finalText && !message.is_error && resultText) {
            state.finalText = resultText
            await options.onTextDelta?.(resultText)
          }

          if (message.is_error) {
            const errorText = ('errors' in message && Array.isArray(message.errors) ? message.errors.join('\n') : '')
              || 'Local Claude Code returned an execution error.'
            throw new Error(errorText)
          }
          break
        }
      }
    }
  }
  catch (error) {
    if (options.abortSignal?.aborted) {
      state.finishReason = 'aborted'
    }
    else {
      throw error
    }
  }
  finally {
    stream.close()
  }

  if (latestSessionId)
    sessionIdsByConversation.set(options.conversationId, latestSessionId)

  return {
    model: latestModel,
    sessionId: latestSessionId,
    finishReason: state.finishReason,
    text: state.finalText,
    usage: state.usage,
  }
}
