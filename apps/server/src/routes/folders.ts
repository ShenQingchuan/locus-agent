import { Hono } from 'hono'
import {
  createFolder,
  deleteFolder,
  listFolders,
  updateFolder,
} from '../services/folder.js'

export const foldersRoutes = new Hono()

// GET /api/folders - 获取所有文件夹（前端构建树形结构）
foldersRoutes.get('/', async (c) => {
  const result = await listFolders()
  return c.json({ folders: result })
})

// POST /api/folders - 创建文件夹
foldersRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { name, parentId } = body

  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Name is required' }, 400)
  }

  const folder = await createFolder({ name, parentId })
  return c.json(folder, 201)
})

// PATCH /api/folders/:id - 更新文件夹
foldersRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { name, parentId, sortOrder } = body

  const updated = await updateFolder(id, { name, parentId, sortOrder })

  if (!updated) {
    return c.json({ error: 'Folder not found' }, 404)
  }

  return c.json(updated)
})

// DELETE /api/folders/:id - 删除文件夹
foldersRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const deleted = await deleteFolder(id)

  if (!deleted) {
    return c.json({ error: 'Folder not found' }, 404)
  }

  return c.json({ success: true })
})
