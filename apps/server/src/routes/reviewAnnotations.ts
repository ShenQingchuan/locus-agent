import { Hono } from 'hono'
import {
  addAnnotation,
  clearAllByProject,
  createGroup,
  deleteGroup,
  listGroupsByProject,
  removeAnnotation,
  renameGroup,
  updateAnnotation,
} from '../services/reviewAnnotation.js'

export const reviewAnnotationsRoutes = new Hono()

// GET /api/review-annotations?projectKey=xxx
reviewAnnotationsRoutes.get('/', async (c) => {
  const projectKey = c.req.query('projectKey')
  if (!projectKey)
    return c.json({ error: 'projectKey is required' }, 400)

  const groups = await listGroupsByProject(projectKey)
  return c.json({ groups })
})

// POST /api/review-annotations/groups
reviewAnnotationsRoutes.post('/groups', async (c) => {
  const body = await c.req.json()
  const { id, projectKey, title } = body

  if (!projectKey || !title)
    return c.json({ error: 'projectKey and title are required' }, 400)

  const group = await createGroup({ id, projectKey, title })
  return c.json(group, 201)
})

// PATCH /api/review-annotations/groups/:id
reviewAnnotationsRoutes.patch('/groups/:id', async (c) => {
  const { title } = await c.req.json()
  if (!title)
    return c.json({ error: 'title is required' }, 400)

  const ok = await renameGroup(c.req.param('id'), title)
  if (!ok)
    return c.json({ error: 'Group not found' }, 404)

  return c.json({ success: true })
})

// DELETE /api/review-annotations/groups/:id
reviewAnnotationsRoutes.delete('/groups/:id', async (c) => {
  const ok = await deleteGroup(c.req.param('id'))
  if (!ok)
    return c.json({ error: 'Group not found' }, 404)

  return c.json({ success: true })
})

// POST /api/review-annotations/annotations
reviewAnnotationsRoutes.post('/annotations', async (c) => {
  const body = await c.req.json()
  const { id, groupId, filePath, side, lineStart, lineEnd, comment } = body

  if (!groupId || !filePath || !side || lineStart == null || lineEnd == null || !comment)
    return c.json({ error: 'groupId, filePath, side, lineStart, lineEnd, and comment are required' }, 400)

  const annotation = await addAnnotation({ id, groupId, filePath, side, lineStart, lineEnd, comment })
  return c.json(annotation, 201)
})

// PATCH /api/review-annotations/annotations/:id
reviewAnnotationsRoutes.patch('/annotations/:id', async (c) => {
  const { comment } = await c.req.json()
  if (!comment)
    return c.json({ error: 'comment is required' }, 400)

  const ok = await updateAnnotation(c.req.param('id'), comment)
  if (!ok)
    return c.json({ error: 'Annotation not found' }, 404)

  return c.json({ success: true })
})

// DELETE /api/review-annotations/annotations/:id
reviewAnnotationsRoutes.delete('/annotations/:id', async (c) => {
  const ok = await removeAnnotation(c.req.param('id'))
  if (!ok)
    return c.json({ error: 'Annotation not found' }, 404)

  return c.json({ success: true })
})

// DELETE /api/review-annotations?projectKey=xxx
reviewAnnotationsRoutes.delete('/', async (c) => {
  const projectKey = c.req.query('projectKey')
  if (!projectKey)
    return c.json({ error: 'projectKey is required' }, 400)

  await clearAllByProject(projectKey)
  return c.json({ success: true })
})
