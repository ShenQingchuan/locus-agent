import type { ModelMessage } from 'ai'
import { eq } from 'drizzle-orm'
import { db, delegateSessions } from '../db/index.js'

export interface DelegateSessionState {
  taskId: string
  conversationId?: string
  agentName: string
  agentType: string
  systemPrompt: string
  messages: ModelMessage[]
  createdAt: number
  updatedAt: number
}

function toState(row: typeof delegateSessions.$inferSelect): DelegateSessionState {
  return {
    taskId: row.taskId,
    conversationId: row.conversationId ?? undefined,
    agentName: row.agentName,
    agentType: row.agentType,
    systemPrompt: row.systemPrompt,
    messages: (row.messages as ModelMessage[]) ?? [],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

export async function getDelegateSession(taskId: string): Promise<DelegateSessionState | null> {
  const [row] = await db
    .select()
    .from(delegateSessions)
    .where(eq(delegateSessions.taskId, taskId))

  return row ? toState(row) : null
}

export async function upsertDelegateSession(state: DelegateSessionState): Promise<void> {
  const createdAt = new Date(state.createdAt)
  const updatedAt = new Date(state.updatedAt)

  await db
    .insert(delegateSessions)
    .values({
      taskId: state.taskId,
      conversationId: state.conversationId ?? null,
      agentName: state.agentName,
      agentType: state.agentType,
      systemPrompt: state.systemPrompt,
      messages: state.messages,
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: delegateSessions.taskId,
      set: {
        conversationId: state.conversationId ?? null,
        agentName: state.agentName,
        agentType: state.agentType,
        systemPrompt: state.systemPrompt,
        messages: state.messages,
        updatedAt,
      },
    })
}
