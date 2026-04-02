import { generateText } from 'ai'
import { Hono } from 'hono'
import { z } from 'zod'
import { resolvePendingApprovalsForConversation } from '../agent/approval.js'
import { createLLMModel, getCurrentModelInfo } from '../agent/providers/index.js'
import {
  conversationExists,
  createScopedConversation,
  deleteConversation,
  getConversationWithMessages,
  listScopedConversations,
  updateConversation,
} from '../services/conversation.js'
import { addMessage, getMessages, truncateMessages } from '../services/message.js'
import { updateActiveConfirmMode } from './chat.js'

const RE_SURROUNDING_QUOTES = /^["']|["']$/g

const CreateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  space: z.enum(['chat', 'coding']).optional(),
  projectKey: z.string().max(100).optional(),
})

const UpdateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  confirmMode: z.boolean().optional(),
})

const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  model: z.string().optional(),
  toolCalls: z.array(z.unknown()).optional(),
  toolResults: z.array(z.unknown()).optional(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
})

const TruncateMessagesSchema = z.object({
  keepCount: z.number().int().min(0),
})

export const conversationsRoutes = new Hono()

// GET /api/conversations - List all conversations
conversationsRoutes.get('/', async (c) => {
  const spaceQuery = c.req.query('space')
  const space = spaceQuery === 'chat' || spaceQuery === 'coding'
    ? spaceQuery
    : undefined
  const projectKey = c.req.query('projectKey')

  const result = await listScopedConversations({
    space,
    projectKey,
  })
  return c.json({ conversations: result })
})

// POST /api/conversations - Create a new conversation
conversationsRoutes.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = CreateConversationSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
  }

  const { title, space, projectKey } = parsed.data
  const conversation = await createScopedConversation({
    title,
    space: space === 'coding' ? 'coding' : 'chat',
    projectKey,
  })
  return c.json({ conversation }, 201)
})

// GET /api/conversations/:id - Get a conversation with messages
conversationsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')

  const result = await getConversationWithMessages(id)

  if (!result) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json({
    ...result.conversation,
    messages: result.messages,
  })
})

// PATCH /api/conversations/:id - Update a conversation
conversationsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')

  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = UpdateConversationSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
  }

  const { title, confirmMode } = parsed.data

  const updated = await updateConversation(id, { title, confirmMode })

  if (!updated) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  // Sync to the running agent loop (if any)
  if (confirmMode !== undefined) {
    updateActiveConfirmMode(id, confirmMode)
    if (!confirmMode) {
      resolvePendingApprovalsForConversation(id, true)
    }
  }

  return c.json(updated)
})

// DELETE /api/conversations/:id - Delete a conversation
conversationsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')

  const deleted = await deleteConversation(id)

  if (!deleted) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json({ success: true })
})

const GENERATE_TITLE_PROMPT = `
Generate a concise title (max 24 characters) for this conversation.
Use the same language as the conversation.
Output ONLY the title text, no quotes or formatting.
`
// POST /api/conversations/:id/generate-title - Generate a title using LLM
conversationsRoutes.post('/:id/generate-title', async (c) => {
  const conversationId = c.req.param('id')

  const result = await getConversationWithMessages(conversationId)
  if (!result) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  // Collect the last 2 rounds of Q&A (up to 4 messages: user, assistant, user, assistant)
  const msgs = result.messages
  const qaPairs: Array<{ role: string, content: string }> = []
  for (let i = msgs.length - 1; i >= 0 && qaPairs.length < 4; i--) {
    const m = msgs[i]!
    if (m.role === 'user' || m.role === 'assistant') {
      qaPairs.unshift({ role: m.role, content: m.content })
    }
  }

  if (qaPairs.length === 0) {
    return c.json({ error: 'No messages to generate title from' }, 400)
  }

  const conversationSnippet = qaPairs
    .map(m => `${m.role}: ${m.content.slice(0, 50)}`)
    .join('\n')

  try {
    const modelInfo = getCurrentModelInfo()
    const model = createLLMModel(modelInfo.model, false)

    const { text } = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: `${GENERATE_TITLE_PROMPT}\n\n${conversationSnippet}`,
        },
      ],
    })

    const title = text.trim().replace(RE_SURROUNDING_QUOTES, '').slice(0, 24)

    const updated = await updateConversation(conversationId, { title }, { touch: false })
    return c.json({ success: true, title: updated?.title ?? title, model: `${modelInfo.provider}/${modelInfo.model}` })
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return c.json({ error: `Failed to generate title: ${errorMessage}` }, 500)
  }
})

// POST /api/conversations/:id/messages - Add a message to a conversation
conversationsRoutes.post('/:id/messages', async (c) => {
  const conversationId = c.req.param('id')

  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = AddMessageSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
  }

  const { role, content, model, toolCalls, toolResults, usage } = parsed.data

  const exists = await conversationExists(conversationId)

  if (!exists) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const message = await addMessage(conversationId, {
    role,
    content,
    model,
    toolCalls: toolCalls as any,
    toolResults: toolResults as any,
    usage,
  })

  return c.json(message, 201)
})

// POST /api/conversations/:id/truncate - Truncate messages, keeping only the first N
conversationsRoutes.post('/:id/truncate', async (c) => {
  const conversationId = c.req.param('id')

  let body: unknown
  try {
    body = await c.req.json()
  }
  catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const parsed = TruncateMessagesSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400)
  }

  const { keepCount } = parsed.data

  const exists = await conversationExists(conversationId)
  if (!exists) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const deletedCount = await truncateMessages(conversationId, keepCount)
  return c.json({ success: true, deletedCount })
})

// GET /api/conversations/:id/messages - Get all messages of a conversation
conversationsRoutes.get('/:id/messages', async (c) => {
  const conversationId = c.req.param('id')

  const exists = await conversationExists(conversationId)

  if (!exists) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const messages = await getMessages(conversationId)
  return c.json(messages)
})
