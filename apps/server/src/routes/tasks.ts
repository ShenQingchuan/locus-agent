import { Hono } from 'hono'
import {
  createTask,
  deleteTask,
  getTask,
  getTaskConversationIds,
  linkConversation,
  listTasks,
  reorderTask,
  updateTask,
} from '../services/task.js'

export const tasksRoutes = new Hono()

// GET /api/tasks?projectKey=xxx
tasksRoutes.get('/', async (c) => {
  const projectKey = c.req.query('projectKey')
  if (!projectKey)
    return c.json({ error: 'projectKey is required' }, 400)

  const result = await listTasks(projectKey)
  return c.json({ tasks: result })
})

// POST /api/tasks
tasksRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { title, spec, contextMarkdown, status, priority, projectKey, conversationId } = body

  if (!title || !projectKey)
    return c.json({ error: 'title and projectKey are required' }, 400)

  const task = await createTask({ title, spec, contextMarkdown, status, priority, projectKey, conversationId })
  return c.json(task, 201)
})

// GET /api/tasks/:id
tasksRoutes.get('/:id', async (c) => {
  const task = await getTask(c.req.param('id'))
  if (!task)
    return c.json({ error: 'Task not found' }, 404)

  const conversationIds = await getTaskConversationIds(task.id)
  return c.json({ task, conversationIds })
})

// PATCH /api/tasks/:id
tasksRoutes.patch('/:id', async (c) => {
  const body = await c.req.json()
  const updated = await updateTask(c.req.param('id'), body)
  if (!updated)
    return c.json({ error: 'Task not found' }, 404)

  return c.json(updated)
})

// DELETE /api/tasks/:id
tasksRoutes.delete('/:id', async (c) => {
  const deleted = await deleteTask(c.req.param('id'))
  if (!deleted)
    return c.json({ error: 'Task not found' }, 404)

  return c.json({ success: true })
})

// POST /api/tasks/:id/reorder
tasksRoutes.post('/:id/reorder', async (c) => {
  const { targetStatus, targetIndex } = await c.req.json()
  if (!targetStatus || targetIndex === undefined)
    return c.json({ error: 'targetStatus and targetIndex are required' }, 400)

  const result = await reorderTask(c.req.param('id'), targetStatus, targetIndex)
  if (!result)
    return c.json({ error: 'Task not found' }, 404)

  return c.json(result)
})

// POST /api/tasks/:id/link-conversation
tasksRoutes.post('/:id/link-conversation', async (c) => {
  const { conversationId } = await c.req.json()
  if (!conversationId)
    return c.json({ error: 'conversationId is required' }, 400)

  const task = await getTask(c.req.param('id'))
  if (!task)
    return c.json({ error: 'Task not found' }, 404)

  await linkConversation(task.id, conversationId)
  return c.json({ success: true })
})
