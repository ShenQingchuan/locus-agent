import { Hono } from 'hono'
import {
  deleteTag,
  listTagsWithCount,
  renameTag,
} from '../services/tag.js'

export const tagsRoutes = new Hono()

// GET /api/tags - 获取所有标签（附带使用计数）
tagsRoutes.get('/', async (c) => {
  const result = await listTagsWithCount()
  return c.json({ tags: result })
})

// PATCH /api/tags/:id - 重命名标签
tagsRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name } = body

  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Name is required' }, 400)
  }

  const updated = await renameTag(id, name)

  if (!updated) {
    return c.json({ error: 'Tag not found' }, 404)
  }

  return c.json(updated)
})

// DELETE /api/tags/:id - 删除标签
tagsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const deleted = await deleteTag(id)

  if (!deleted) {
    return c.json({ error: 'Tag not found' }, 404)
  }

  return c.json({ success: true })
})
