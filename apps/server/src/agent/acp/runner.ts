/**
 * Abstract ACP runner — protocol-level machinery shared by all ACP providers.
 *
 * Each ACP agent (claude-agent-acp, kimi-cli, …) differs only in how its
 * subprocess is spawned and what session metadata it accepts.  Everything else
 * — connection lifecycle, session mapping, SessionNotification → callback
 * translation — lives here.
 */

import type {
  Client,
  ContentBlock,
  PlanEntry,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk'
import type { DelegateDelta, MessageImageAttachment } from '@univedge/locus-agent-sdk'
import type { ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

// ---------------------------------------------------------------------------
// Public callback / options / result types
// ---------------------------------------------------------------------------

export interface ACPCallbacks {
  onTextDelta?: (delta: string) => void | Promise<void>
  onReasoningDelta?: (delta: string) => void | Promise<void>
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean, isInterrupted?: boolean) => void | Promise<void>
  onToolPendingApproval?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  onToolOutputDelta?: (toolCallId: string, stream: 'stdout' | 'stderr', delta: string) => void | Promise<void>
  onDelegateDelta?: (toolCallId: string, delta: DelegateDelta) => void | Promise<void>
}

export interface RunACPOptions extends ACPCallbacks {
  prompt: string
  attachments?: MessageImageAttachment[]
  conversationId: string
  workspaceRoot: string
  abortSignal?: AbortSignal
  /** Pre-formatted prior conversation context, injected when starting a fresh session. */
  priorContext?: string
}

export interface ACPResult {
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

// ---------------------------------------------------------------------------
// Runner config — the only provider-specific seam
// ---------------------------------------------------------------------------

export interface ACPRunnerConfig {
  /** Human-readable label for logs. */
  name: string
  /** Spawn the ACP subprocess for the given working directory. */
  spawn: (cwd: string) => ChildProcess
  /** Provider-specific extra fields for `newSession._meta`. */
  sessionMeta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PendingTool {
  toolName: string
  args: Record<string, unknown>
  started: boolean
}

interface RuntimeState {
  finalText: string
  finishReason: string
  model?: string
  sessionId?: string
  usage: ACPResult['usage']
  pendingTools: Map<string, PendingTool>
}

// ---------------------------------------------------------------------------
// SessionNotification → callback mapping (protocol-level, provider-agnostic)
// ---------------------------------------------------------------------------

async function mapSessionUpdate(
  update: SessionNotification['update'],
  callbacks: ACPCallbacks,
  state: RuntimeState,
): Promise<void> {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      if (update.content?.type === 'text' && update.content.text) {
        state.finalText += update.content.text
        await callbacks.onTextDelta?.(update.content.text)
      }
      break
    }

    case 'agent_thought_chunk': {
      if (update.content?.type === 'text' && update.content.text) {
        await callbacks.onReasoningDelta?.(update.content.text)
      }
      break
    }

    case 'tool_call': {
      const meta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined
      const toolName = meta?.claudeCode?.toolName ?? update.title ?? 'unknown'
      const rawInput = update.rawInput as Record<string, unknown> | undefined
      const hasCompleteArgs = rawInput != null && Object.keys(rawInput).length > 0

      if (hasCompleteArgs) {
        state.pendingTools.set(update.toolCallId, { toolName, args: rawInput, started: true })
        await callbacks.onToolCallStart?.(update.toolCallId, toolName, rawInput)
      }
      else {
        state.pendingTools.set(update.toolCallId, { toolName, args: {}, started: false })
      }
      break
    }

    case 'tool_call_update': {
      const updateMeta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined
      const toolName = updateMeta?.claudeCode?.toolName ?? 'unknown'
      const rawInput = update.rawInput as Record<string, unknown> | undefined
      const isTerminal = update.status === 'completed' || update.status === 'failed'
      const pending = state.pendingTools.get(update.toolCallId)

      if (!isTerminal) {
        if (rawInput != null && Object.keys(rawInput).length > 0) {
          const name = pending?.toolName ?? toolName
          if (pending)
            pending.args = rawInput
          if (!pending?.started) {
            if (pending)
              pending.started = true
            await callbacks.onToolCallStart?.(update.toolCallId, name, rawInput)
          }
        }
        break
      }

      if (pending && !pending.started) {
        await callbacks.onToolCallStart?.(update.toolCallId, pending.toolName, pending.args)
        pending.started = true
      }

      await callbacks.onToolCallResult?.(
        update.toolCallId,
        pending?.toolName ?? toolName,
        update.rawOutput ?? { status: update.status },
        update.status === 'failed',
      )
      state.pendingTools.delete(update.toolCallId)
      break
    }

    case 'plan': {
      const summary = update.entries
        .map((e: PlanEntry) => `[${e.status}] ${e.content}`)
        .join('\n')
      if (summary) {
        await callbacks.onDelegateDelta?.('plan', { type: 'text', content: summary })
      }
      break
    }

    case 'usage_update': {
      if ('used' in update && typeof update.used === 'number') {
        state.usage.inputTokens = update.used
      }
      break
    }
  }
}

// ---------------------------------------------------------------------------
// createACPRunner — factory function
// ---------------------------------------------------------------------------

const RE_BASE64_DATA_URL = /^data:.*?;base64,(.+)$/

export function createACPRunner(config: ACPRunnerConfig): {
  run: (options: RunACPOptions) => Promise<ACPResult>
} {
  let acpProcess: ChildProcess | null = null
  let acpConnection: ClientSideConnection | null = null
  let connectionReady: Promise<void> | null = null

  let activeUpdateHandler: ((params: SessionNotification) => Promise<void>) | null = null
  let activePermissionHandler: ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>) | null = null

  const sessionByConversation = new Map<string, string>()

  const RE_EPIPE = /EPIPE|broken pipe|ACP write error/i

  function spawnProcess(cwd: string): ChildProcess {
    const child = config.spawn(cwd)

    // Pipe stderr and suppress expected EPIPE noise that occurs when the server
    // closes the connection while the subprocess is still writing.
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        if (!RE_EPIPE.test(text))
          process.stderr.write(`[acp:${config.name}] ${text}`)
      })
    }

    child.on('exit', (code, signal) => {
      if (signal !== 'SIGTERM')
        console.error(`[acp:${config.name}] exited: code=${code} signal=${signal}`)
      acpProcess = null
      acpConnection = null
      connectionReady = null
      sessionByConversation.clear()
    })
    return child
  }

  async function getConnection(cwd: string): Promise<ClientSideConnection> {
    if (acpConnection && acpProcess && !acpProcess.killed) {
      await connectionReady
      return acpConnection
    }

    acpProcess = spawnProcess(cwd)

    const stream = ndJsonStream(
      Writable.toWeb(acpProcess.stdin!) as WritableStream<Uint8Array>,
      Readable.toWeb(acpProcess.stdout!) as unknown as ReadableStream<Uint8Array>,
    )

    acpConnection = new ClientSideConnection(
      _agent => ({
        async requestPermission(params) {
          if (activePermissionHandler)
            return activePermissionHandler(params)
          const firstOption = params.options?.[0]
          if (firstOption) {
            return { outcome: { outcome: 'selected' as const, optionId: firstOption.optionId } }
          }
          return { outcome: { outcome: 'cancelled' as const } }
        },

        async sessionUpdate(params: SessionNotification): Promise<void> {
          if (activeUpdateHandler)
            await activeUpdateHandler(params)
        },

        async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
          const content = await readFile(params.path, 'utf-8')
          return { content }
        },

        async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
          await mkdir(dirname(params.path), { recursive: true })
          await writeFile(params.path, params.content, 'utf-8')
          return {}
        },
      } satisfies Client),
      stream,
    )

    connectionReady = acpConnection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
      },
    }).then(() => {})

    await connectionReady
    return acpConnection
  }

  async function ensureSession(conn: ClientSideConnection, conversationId: string, cwd: string): Promise<string> {
    const existing = sessionByConversation.get(conversationId)
    if (existing) {
      try {
        await conn.unstable_resumeSession({ sessionId: existing, cwd, mcpServers: [] })
        return existing
      }
      catch {
        sessionByConversation.delete(conversationId)
      }
    }

    const response = await conn.newSession({
      cwd,
      mcpServers: [],
      ...(config.sessionMeta ? { _meta: config.sessionMeta } : {}),
    })

    sessionByConversation.set(conversationId, response.sessionId)
    return response.sessionId
  }

  return {
    async run(options: RunACPOptions): Promise<ACPResult> {
      const state: RuntimeState = {
        finalText: '',
        finishReason: 'unknown',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        pendingTools: new Map(),
      }

      // Detect fresh session before ensureSession creates one
      const isFreshSession = !sessionByConversation.has(options.conversationId)

      const conn = await getConnection(options.workspaceRoot)
      const sessionId = await ensureSession(conn, options.conversationId, options.workspaceRoot)
      state.sessionId = sessionId

      activeUpdateHandler = async (params: SessionNotification) => {
        await mapSessionUpdate(params.update, options, state)
      }

      activePermissionHandler = async (params: RequestPermissionRequest) => {
        const firstOption = params.options?.[0]
        if (firstOption) {
          return { outcome: { outcome: 'selected' as const, optionId: firstOption.optionId } }
        }
        return { outcome: { outcome: 'cancelled' as const } }
      }

      const promptContent: ContentBlock[] = []

      // Inject prior context when starting a fresh session (e.g. provider switched mid-conversation)
      if (isFreshSession && options.priorContext?.trim()) {
        promptContent.push({
          type: 'text',
          text: `[Prior conversation context — for reference only, do not repeat]\n${options.priorContext}\n\n[Current request]\n${options.prompt}`,
        })
      }
      else if (options.prompt.trim()) {
        promptContent.push({ type: 'text', text: options.prompt })
      }

      if (options.attachments?.length) {
        for (const attachment of options.attachments) {
          const match = attachment.dataUrl.match(RE_BASE64_DATA_URL)
          if (match?.[1]) {
            promptContent.push({
              type: 'image',
              data: match[1],
              mimeType: attachment.mimeType,
            })
          }
        }
      }

      // Kill the subprocess when the caller aborts so it stops writing to the
      // pipe immediately, preventing EPIPE errors.
      const killOnAbort = () => {
        if (acpProcess && !acpProcess.killed)
          acpProcess.kill('SIGTERM')
      }
      options.abortSignal?.addEventListener('abort', killOnAbort, { once: true })

      try {
        const result = await conn.prompt({
          sessionId,
          prompt: promptContent,
        })

        state.finishReason = result.stopReason ?? 'end_turn'

        if (result.usage) {
          state.usage = {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
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
        options.abortSignal?.removeEventListener('abort', killOnAbort)
        activeUpdateHandler = null
        activePermissionHandler = null
      }

      return {
        model: state.model,
        sessionId: state.sessionId,
        finishReason: state.finishReason,
        text: state.finalText,
        usage: state.usage,
      }
    },
  }
}
