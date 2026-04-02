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
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk'

// ---------------------------------------------------------------------------
// Public interfaces (unchanged — chat.ts depends on these)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ACP process management — singleton per server process
// ---------------------------------------------------------------------------

let acpProcess: ReturnType<typeof spawn> | null = null
let acpConnection: ClientSideConnection | null = null
let connectionReady: Promise<void> | null = null

/** Per-prompt handler callbacks, swapped by runLocalClaudeCode() for each prompt turn. */
let activeUpdateHandler: ((params: SessionNotification) => Promise<void>) | null = null
let activePermissionHandler: ((params: RequestPermissionRequest) => Promise<RequestPermissionResponse>) | null = null

function setUpdateHandler(h: typeof activeUpdateHandler): void {
  activeUpdateHandler = h
}

function setPermissionHandler(h: typeof activePermissionHandler): void {
  activePermissionHandler = h
}

/** Map Locus conversationId → ACP sessionId */
const sessionByConversation = new Map<string, string>()

/** Resolve the claude-agent-acp binary entry point (dist/index.js) */
function resolveAcpBinary(): string {
  // createRequire gives us Node-style resolution relative to this file
  const require = createRequire(import.meta.url)
  try {
    const pkgJsonPath = require.resolve('@agentclientprotocol/claude-agent-acp/package.json')
    const pkgRoot = dirname(pkgJsonPath)
    return resolve(pkgRoot, 'dist/index.js')
  }
  catch {
    // Fallback when resolution fails (should not happen in production)
    const thisFile = fileURLToPath(import.meta.url)
    return resolve(dirname(thisFile), '../../node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js')
  }
}

function spawnAcpProcess(cwd: string): ReturnType<typeof spawn> {
  const binPath = resolveAcpBinary()
  const child = spawn(process.execPath, [binPath], {
    cwd,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      PATH: process.env.PATH,
    },
  })

  child.on('exit', (code, signal) => {
    console.error(`[acp] claude-agent-acp exited: code=${code} signal=${signal}`)
    acpProcess = null
    acpConnection = null
    connectionReady = null
    // Clear all sessions so they get re-created
    sessionByConversation.clear()
  })

  return child
}

/** Get or create the singleton ACP connection */
async function getConnection(cwd: string): Promise<ClientSideConnection> {
  if (acpConnection && acpProcess && !acpProcess.killed) {
    await connectionReady
    return acpConnection
  }

  acpProcess = spawnAcpProcess(cwd)

  const stream = ndJsonStream(
    Writable.toWeb(acpProcess.stdin!) as WritableStream<Uint8Array>,
    Readable.toWeb(acpProcess.stdout!) as unknown as ReadableStream<Uint8Array>,
  )

  acpConnection = new ClientSideConnection(
    _agent => ({
      async requestPermission(params) {
        if (activePermissionHandler)
          return activePermissionHandler(params)
        // Default: auto-approve with first option
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

/** Get or create an ACP session for a conversation */
async function ensureSession(conn: ClientSideConnection, conversationId: string, cwd: string): Promise<string> {
  const existing = sessionByConversation.get(conversationId)
  if (existing) {
    // Try to resume
    try {
      await conn.unstable_resumeSession({ sessionId: existing, cwd, mcpServers: [] })
      return existing
    }
    catch {
      // Session may have expired, create new one
      sessionByConversation.delete(conversationId)
    }
  }

  const response = await conn.newSession({
    cwd,
    mcpServers: [],
    _meta: {
      claudeCode: {
        options: {
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
        },
      },
    },
  })

  sessionByConversation.set(conversationId, response.sessionId)
  return response.sessionId
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

interface PendingTool {
  toolName: string
  args: Record<string, unknown>
  /** Whether onToolCallStart has already been fired for this tool. */
  started: boolean
}

interface RuntimeState {
  finalText: string
  finishReason: string
  model?: string
  sessionId?: string
  usage: LocalClaudeCodeResult['usage']
  /** Buffer for tool calls awaiting complete args from tool_call_update refinement. */
  pendingTools: Map<string, PendingTool>
}

// ---------------------------------------------------------------------------
// ACP event → Locus callback mapping
// ---------------------------------------------------------------------------

async function mapSessionUpdate(
  update: SessionNotification['update'],
  callbacks: LocalClaudeCodeCallbacks,
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
      // ACP fires tool_call at content_block_start — input may still be empty.
      // Buffer it: fire onToolCallStart only when we get the complete rawInput
      // from the subsequent tool_call_update refinement event.
      const meta = update._meta as { claudeCode?: { toolName?: string } } | null | undefined
      const toolName = meta?.claudeCode?.toolName ?? update.title ?? 'unknown'
      const rawInput = update.rawInput as Record<string, unknown> | undefined
      const hasCompleteArgs = rawInput != null && Object.keys(rawInput).length > 0

      if (hasCompleteArgs) {
        // Already have args (non-streaming case) — fire immediately
        state.pendingTools.set(update.toolCallId, { toolName, args: rawInput, started: true })
        await callbacks.onToolCallStart?.(update.toolCallId, toolName, rawInput)
      }
      else {
        // Buffer and wait for refinement update
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
        // Refinement update: complete args have arrived
        if (rawInput != null && Object.keys(rawInput).length > 0) {
          const name = pending?.toolName ?? toolName
          if (pending) {
            pending.args = rawInput
          }
          if (!pending?.started) {
            // Fire onToolCallStart now with the complete args
            if (pending)
              pending.started = true
            await callbacks.onToolCallStart?.(update.toolCallId, name, rawInput)
          }
        }
        break
      }

      // Terminal: fire onToolCallStart first if we never did (edge case)
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
        await callbacks.onDelegateDelta?.('plan', {
          type: 'text',
          content: summary,
        })
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
// Main entry (public API unchanged)
// ---------------------------------------------------------------------------

const RE_BASE64_DATA_URL = /^data:.*?;base64,(.+)$/
export async function runLocalClaudeCode(options: RunLocalClaudeCodeOptions): Promise<LocalClaudeCodeResult> {
  const state: RuntimeState = {
    finalText: '',
    finishReason: 'unknown',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    pendingTools: new Map(),
  }

  const conn = await getConnection(options.workspaceRoot)
  const sessionId = await ensureSession(conn, options.conversationId, options.workspaceRoot)
  state.sessionId = sessionId

  // Wire up session update handler for this prompt
  setUpdateHandler(async (params: SessionNotification) => {
    await mapSessionUpdate(params.update, options, state)
  })

  // Auto-approve permissions (bypassPermissions mode)
  setPermissionHandler(async (params: RequestPermissionRequest) => {
    const firstOption = params.options?.[0]
    if (firstOption) {
      return { outcome: { outcome: 'selected' as const, optionId: firstOption.optionId } }
    }
    return { outcome: { outcome: 'cancelled' as const } }
  })

  // Build prompt content blocks
  const promptContent: ContentBlock[] = []

  if (options.prompt.trim()) {
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

  try {
    const result = await conn.prompt({
      sessionId,
      prompt: promptContent,
    })

    state.finishReason = result.stopReason ?? 'end_turn'

    // Extract usage from result if available
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
    // Clear handlers
    setUpdateHandler(null)
    setPermissionHandler(null)
  }

  return {
    model: state.model,
    sessionId: state.sessionId,
    finishReason: state.finishReason,
    text: state.finalText,
    usage: state.usage,
  }
}
