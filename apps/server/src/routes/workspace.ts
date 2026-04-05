import { Hono } from 'hono'
import { resolveAllowedDirectory } from '../services/workspace-access.js'
import {
  getWorkspaceRoots,
  getWorkspaceTree,
  listWorkspaceDirectories,
  searchMentions,
} from '../services/workspace-fs.js'
import {
  commitChanges,
  createGitWatchStream,
  discardChanges,
  getGitDiff,
  getGitStatus,
  isGitRepo,
  pushGitRepo,
  stageFiles,
  suggestCommitMessage,
  unstageFiles,
} from '../services/workspace-git.js'

export const workspaceRoutes = new Hono()

workspaceRoutes.get('/roots', async (c) => {
  const result = await getWorkspaceRoots()
  return c.json(result)
})

workspaceRoutes.get('/list', async (c) => {
  try {
    const path = c.req.query('path')
    const result = await listWorkspaceDirectories(path)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.get('/tree', async (c) => {
  try {
    const path = c.req.query('path')
    const result = await getWorkspaceTree(path)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.get('/mention-search', async (c) => {
  try {
    const query = c.req.query('query') ?? ''
    const basePath = c.req.query('basePath')
    const includeHidden = c.req.query('includeHidden') === 'true'
    const result = await searchMentions(query, basePath, includeHidden)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

// ---------------------------------------------------------------------------
// Git routes
// ---------------------------------------------------------------------------

workspaceRoutes.get('/git/status', async (c) => {
  try {
    const path = c.req.query('path')
    const directoryPath = await resolveAllowedDirectory(path)
    const result = await getGitStatus(directoryPath)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.get('/git/diff', async (c) => {
  try {
    const path = c.req.query('path')
    const file = c.req.query('file')
    const staged = c.req.query('staged') // 'true' | 'false' | undefined
    const directoryPath = await resolveAllowedDirectory(path)
    const result = await getGitDiff(directoryPath, file ?? null, staged ?? null)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/stage', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await stageFiles(directoryPath, body.filePaths)
    if (!result.success) {
      return c.json(result, 400)
    }
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/unstage', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await unstageFiles(directoryPath, body.filePaths)
    if (!result.success) {
      return c.json(result, 400)
    }
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/commit', async (c) => {
  try {
    const body = await c.req.json<{ path: string, message: string, filePaths?: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await commitChanges(directoryPath, body.message, body.filePaths)
    if (!result.success) {
      return c.json(result, 400)
    }
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.get('/git/watch', async (c) => {
  try {
    const path = c.req.query('path')
    const directoryPath = await resolveAllowedDirectory(path)

    if (!await isGitRepo(directoryPath)) {
      return c.json({ error: 'Not a git repository' }, 400)
    }

    const stream = createGitWatchStream(directoryPath)

    c.req.raw.signal.addEventListener('abort', () => {
      // ReadableStream's cancel() will be called automatically when the response is aborted
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/push', async (c) => {
  try {
    const body = await c.req.json<{ path: string }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await pushGitRepo(directoryPath)
    if (!result.success) {
      return c.json(result, 400)
    }
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/discard', async (c) => {
  try {
    const body = await c.req.json<{ path: string, filePaths: string[] }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await discardChanges(directoryPath, body.filePaths)
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

workspaceRoutes.post('/git/suggest-commit-message', async (c) => {
  try {
    const body = await c.req.json<{ path: string }>()
    const directoryPath = await resolveAllowedDirectory(body.path)
    const result = await suggestCommitMessage(directoryPath)
    if ('error' in result) {
      return c.json(result, 400)
    }
    return c.json(result)
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
