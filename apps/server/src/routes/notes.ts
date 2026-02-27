import { Hono } from 'hono'
import {
  createNote,
  deleteNote,
  getNoteConversationIds,
  getNoteWithTags,
  listNotes,
  searchNotes,
  updateNote,
} from '../services/note.js'

export const notesRoutes = new Hono()

// GET /api/notes - 列出笔记
notesRoutes.get('/', async (c) => {
  const folderId = c.req.query('folderId')
  const tagId = c.req.query('tagId')
  const limit = c.req.query('limit')
  const offset = c.req.query('offset')

  const result = await listNotes({
    folderId: folderId || undefined,
    tagId,
    limit: limit ? Number.parseInt(limit) : undefined,
    offset: offset ? Number.parseInt(offset) : undefined,
  })

  return c.json({ notes: result })
})

// POST /api/notes - 创建笔记
notesRoutes.post('/', async (c) => {
  const body = await c.req.json()
  const { content, editorState, folderId, tagNames, conversationId } = body

  const note = await createNote({
    content,
    editorState,
    folderId,
    tagNames,
    conversationId,
  })

  return c.json(note, 201)
})

// GET /api/notes/search - 搜索笔记
notesRoutes.get('/search', async (c) => {
  const q = c.req.query('q')
  if (!q) {
    return c.json({ notes: [] })
  }

  const result = await searchNotes(q)
  return c.json({ notes: result })
})

// GET /api/notes/:id - 获取笔记详情
notesRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  const note = await getNoteWithTags(id)

  if (!note) {
    return c.json({ error: 'Note not found' }, 404)
  }

  return c.json(note)
})

// PATCH /api/notes/:id - 更新笔记
notesRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { content, editorState, folderId, tagNames } = body

  const updated = await updateNote(id, {
    content,
    editorState,
    folderId,
    tagNames,
  })

  if (!updated) {
    return c.json({ error: 'Note not found' }, 404)
  }

  return c.json(updated)
})

// DELETE /api/notes/:id - 删除笔记
notesRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const deleted = await deleteNote(id)

  if (!deleted) {
    return c.json({ error: 'Note not found' }, 404)
  }

  return c.json({ success: true })
})

// GET /api/notes/:id/conversations - 获取笔记关联的对话
notesRoutes.get('/:id/conversations', async (c) => {
  const id = c.req.param('id')
  const conversationIds = await getNoteConversationIds(id)
  return c.json({ conversationIds })
})
