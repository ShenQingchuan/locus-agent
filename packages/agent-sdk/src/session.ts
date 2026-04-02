/**
 * Session storage and lifecycle management.
 *
 * Persists conversation transcripts to disk so they can be resumed, listed,
 * forked, or deleted. Sessions are stored as JSON files under
 * `~/.locus-agent/sessions/<sessionId>/transcript.json`.
 *
 * All functions are async and safe to call concurrently for different sessions.
 * They silently return null/empty on missing sessions instead of throwing.
 *
 * @module session
 */

import type { CoreMessage } from './types/message.js'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionMetadata {
  id: string
  /** Absolute working directory when the session was created. */
  cwd: string
  /** Model ID used for this session. */
  model: string
  createdAt: string
  updatedAt: string
  messageCount: number
  /** Human-readable summary or title. */
  summary?: string
  /** Optional tag for grouping. */
  tag?: string | null
}

export interface SessionData {
  metadata: SessionMetadata
  messages: CoreMessage[]
}

export interface SessionCreateOptions {
  cwd?: string
  model?: string
  summary?: string
}

export interface SessionListOptions {
  /** Filter sessions by working directory prefix. */
  dir?: string
  limit?: number
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function getSessionsDir(): string {
  return join(homedir(), '.locus-agent', 'sessions')
}

function getSessionPath(sessionId: string): string {
  return join(getSessionsDir(), sessionId)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a session's messages and metadata to disk.
 * Creates the session directory if it doesn't exist.
 */
export async function saveSession(
  sessionId: string,
  messages: CoreMessage[],
  metadata: Partial<SessionMetadata>,
): Promise<void> {
  const dir = getSessionPath(sessionId)
  await mkdir(dir, { recursive: true })

  const now = new Date().toISOString()
  const data: SessionData = {
    metadata: {
      id: sessionId,
      cwd: metadata.cwd ?? process.cwd(),
      model: metadata.model ?? 'unknown',
      createdAt: metadata.createdAt ?? now,
      updatedAt: now,
      messageCount: messages.length,
      summary: metadata.summary,
      tag: metadata.tag,
    },
    messages,
  }

  await writeFile(join(dir, 'transcript.json'), JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Load a session from disk. Returns `null` if not found or unreadable.
 */
export async function loadSession(sessionId: string): Promise<SessionData | null> {
  try {
    const content = await readFile(join(getSessionPath(sessionId), 'transcript.json'), 'utf-8')
    return JSON.parse(content) as SessionData
  }
  catch {
    return null
  }
}

/**
 * List all sessions, sorted by `updatedAt` descending (most recent first).
 */
export async function listSessions(options?: SessionListOptions): Promise<SessionMetadata[]> {
  try {
    const entries = await readdir(getSessionsDir())
    const sessions: SessionMetadata[] = []

    for (const entry of entries) {
      const data = await loadSession(entry)
      if (!data?.metadata)
        continue
      if (options?.dir && !data.metadata.cwd.startsWith(options.dir))
        continue
      sessions.push(data.metadata)
    }

    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

    return options?.limit ? sessions.slice(0, options.limit) : sessions
  }
  catch {
    return []
  }
}

/**
 * Get metadata for a single session without loading messages.
 */
export async function getSessionInfo(sessionId: string): Promise<SessionMetadata | null> {
  const data = await loadSession(sessionId)
  return data?.metadata ?? null
}

/**
 * Get only the messages from a session.
 */
export async function getSessionMessages(sessionId: string): Promise<CoreMessage[]> {
  const data = await loadSession(sessionId)
  return data?.messages ?? []
}

/**
 * Fork a session: copy its transcript to a new session ID.
 * Returns the new session ID, or `null` if the source doesn't exist.
 */
export async function forkSession(
  sourceSessionId: string,
  newSessionId?: string,
): Promise<string | null> {
  const data = await loadSession(sourceSessionId)
  if (!data)
    return null

  const forkId = newSessionId ?? crypto.randomUUID()

  await saveSession(forkId, data.messages, {
    ...data.metadata,
    id: forkId,
    createdAt: new Date().toISOString(),
    summary: `Forked from ${sourceSessionId}`,
    tag: null,
  })

  return forkId
}

/**
 * Append a single message to an existing session.
 * No-op if the session doesn't exist.
 */
export async function appendToSession(sessionId: string, message: CoreMessage): Promise<void> {
  const data = await loadSession(sessionId)
  if (!data)
    return

  await saveSession(sessionId, [...data.messages, message], data.metadata)
}

/**
 * Rename (set summary) for a session.
 */
export async function renameSession(sessionId: string, title: string): Promise<void> {
  const data = await loadSession(sessionId)
  if (!data)
    return

  await saveSession(sessionId, data.messages, { ...data.metadata, summary: title })
}

/**
 * Set or clear a tag on a session.
 */
export async function tagSession(sessionId: string, tag: string | null): Promise<void> {
  const data = await loadSession(sessionId)
  if (!data)
    return

  await saveSession(sessionId, data.messages, { ...data.metadata, tag })
}

/**
 * Permanently delete a session directory. Returns `false` on failure.
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await rm(getSessionPath(sessionId), { recursive: true, force: true })
    return true
  }
  catch {
    return false
  }
}
