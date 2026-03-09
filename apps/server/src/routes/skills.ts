import type { SkillPreferenceUpdateRequest, SkillSource } from '@locus-agent/agent-sdk'
import { watch as fsWatch } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  createSkill,
  discoverSkills,
  getSkillDetailById,
  getSkillFileTree,
  readSkillFile,
  updateSkillPreference,
  writeSkillFile,
} from '../services/skills.js'
import { resolveAllowedDirectory } from '../services/workspace-access.js'
import { getSkillsDataDir } from '../settings/index.js'

export const skillsRoutes = new Hono()

async function normalizeWorkspaceRoot(input: string | undefined): Promise<string | undefined> {
  const trimmed = input?.trim()
  if (!trimmed)
    return undefined
  return resolveAllowedDirectory(trimmed)
}

skillsRoutes.get('/', async (c) => {
  try {
    const workspaceRoot = await normalizeWorkspaceRoot(c.req.query('workspaceRoot'))
    const discovered = await discoverSkills({ workspaceRoot })
    return c.json({
      workspaceRoot: discovered.workspaceRoot,
      skills: discovered.skills,
    })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

skillsRoutes.get('/detail', async (c) => {
  const id = c.req.query('id')?.trim()
  if (!id) {
    return c.json({ error: 'Missing skill id' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(c.req.query('workspaceRoot'))
    const skill = await getSkillDetailById(id, { workspaceRoot })
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    return c.json({ workspaceRoot, skill })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

skillsRoutes.get('/files', async (c) => {
  const id = c.req.query('id')?.trim()
  if (!id) {
    return c.json({ error: 'Missing skill id' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(c.req.query('workspaceRoot'))
    const skill = await getSkillDetailById(id, { workspaceRoot })
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    const files = await getSkillFileTree(skill.rootDir)
    return c.json({ rootDir: skill.rootDir, files })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

const updatePreferenceSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().optional(),
  modelInvocable: z.boolean().optional(),
  userInvocable: z.boolean().optional(),
  workspaceRoot: z.string().optional(),
})

skillsRoutes.put('/preferences', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = updatePreferenceSchema.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(parsed.data.workspaceRoot)
    const { workspaceRoot: _workspaceRoot, ...payload } = parsed.data
    const skill = await updateSkillPreference(payload as SkillPreferenceUpdateRequest, { workspaceRoot })
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    return c.json({ success: true, skill })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

const createSkillSchema = z.object({
  name: z.string().min(1).max(64),
  source: z.enum(['system', 'project']),
  workspaceRoot: z.string().optional(),
  description: z.string().max(512).optional(),
})

skillsRoutes.post('/create', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = createSkillSchema.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(parsed.data.workspaceRoot)
    const skill = await createSkill({
      name: parsed.data.name,
      source: parsed.data.source as SkillSource,
      workspaceRoot,
      description: parsed.data.description,
    })
    return c.json({ success: true, skill })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

skillsRoutes.get('/file-content', async (c) => {
  const id = c.req.query('id')?.trim()
  const filePath = c.req.query('filePath')?.trim()
  if (!id || !filePath) {
    return c.json({ error: 'Missing skill id or filePath' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(c.req.query('workspaceRoot'))
    const skill = await getSkillDetailById(id, { workspaceRoot })
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    const result = await readSkillFile(skill.rootDir, filePath)
    return c.json({ path: filePath, content: result.content, language: result.language })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

const saveFileSchema = z.object({
  skillId: z.string().min(1),
  filePath: z.string().min(1),
  content: z.string(),
  workspaceRoot: z.string().optional(),
})

skillsRoutes.put('/file-content', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = saveFileSchema.safeParse(json)
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, 400)
  }

  try {
    const workspaceRoot = await normalizeWorkspaceRoot(parsed.data.workspaceRoot)
    const skill = await getSkillDetailById(parsed.data.skillId, { workspaceRoot })
    if (!skill) {
      return c.json({ error: 'Skill not found' }, 404)
    }

    await writeSkillFile(skill.rootDir, parsed.data.filePath, parsed.data.content)
    return c.json({ success: true })
  }
  catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

// ---------------------------------------------------------------------------
// Skill file watcher — SSE endpoint
// ---------------------------------------------------------------------------

skillsRoutes.get('/watch', async (c) => {
  try {
    const workspaceRoot = await normalizeWorkspaceRoot(c.req.query('workspaceRoot'))

    // Collect directories to watch
    const watchDirs: string[] = []
    const systemSkillsDir = getSkillsDataDir()
    watchDirs.push(systemSkillsDir)

    if (workspaceRoot) {
      const projectSkillsDir = join(workspaceRoot, '.agents', 'skills')
      watchDirs.push(projectSkillsDir)
    }

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null

        function send(data: string) {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
          catch {
            cleanup()
          }
        }

        function notify() {
          if (debounceTimer)
            clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => send('changed'), 300)
        }

        const watchers: ReturnType<typeof fsWatch>[] = []

        for (const dir of watchDirs) {
          try {
            const watcher = fsWatch(dir, { recursive: true }, () => {
              notify()
            })
            watchers.push(watcher)
          }
          catch { /* directory may not exist yet, skip */ }
        }

        // Keepalive to prevent proxy/browser timeout
        const keepalive = setInterval(() => send('keepalive'), 30_000)

        function cleanup() {
          for (const w of watchers) w.close()
          clearInterval(keepalive)
          if (debounceTimer)
            clearTimeout(debounceTimer)
        }

        c.req.raw.signal.addEventListener('abort', () => {
          cleanup()
          try {
            controller.close()
          }
          catch { /* already closed */ }
        })
      },
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
