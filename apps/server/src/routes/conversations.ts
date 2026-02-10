import { Hono } from 'hono'
import {
  conversationExists,
  createConversation,
  deleteConversation,
  getConversationWithMessages,
  listConversations,
  updateConversation,
} from '../services/conversation.js'
import { addMessage, getMessages, truncateMessages } from '../services/message.js'
import { updateActiveConfirmMode } from './chat.js'

export const conversationsRoutes = new Hono()

// GET /api/conversations - List all conversations
conversationsRoutes.get('/', async (c) => {
  const result = await listConversations()
  return c.json({ conversations: result })
})

// POST /api/conversations - Create a new conversation
conversationsRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { title } = body

  const conversation = await createConversation(title)
  return c.json(conversation, 201)
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
  const body = await c.req.json()
  const { title, confirmMode } = body

  const updated = await updateConversation(id, { title, confirmMode })

  if (!updated) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  // Sync to the running agent loop (if any)
  if (confirmMode !== undefined) {
    updateActiveConfirmMode(id, confirmMode)
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

// POST /api/conversations/:id/messages - Add a message to a conversation
conversationsRoutes.post('/:id/messages', async (c) => {
  const conversationId = c.req.param('id')
  const body = await c.req.json()
  const { role, content, toolCalls, toolResults } = body

  const exists = await conversationExists(conversationId)

  if (!exists) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const message = await addMessage(conversationId, {
    role,
    content,
    toolCalls,
    toolResults,
  })

  return c.json(message, 201)
})

// POST /api/conversations/:id/truncate - Truncate messages, keeping only the first N
conversationsRoutes.post('/:id/truncate', async (c) => {
  const conversationId = c.req.param('id')
  const body = await c.req.json<{ keepCount: number }>()
  const { keepCount } = body

  if (typeof keepCount !== 'number' || keepCount < 0) {
    return c.json({ error: 'keepCount must be a non-negative number' }, 400)
  }

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
