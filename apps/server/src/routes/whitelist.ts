import { Hono } from 'hono'
import {
  getAllRules,
  removeRule,
} from '../agent/whitelist.js'

export const whitelistRoutes = new Hono()

// GET /api/chat/whitelist - Get whitelist rules
whitelistRoutes.get('/', async (c) => {
  const conversationId = c.req.query('conversationId')
  const rules = getAllRules(conversationId || undefined)
  return c.json({ success: true, rules })
})

// DELETE /api/chat/whitelist/:id - Delete a whitelist rule
whitelistRoutes.delete('/:id', async (c) => {
  const ruleId = c.req.param('id')
  if (!ruleId) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Rule ID is required' },
      },
      400,
    )
  }
  removeRule(ruleId)
  return c.json({ success: true })
})
