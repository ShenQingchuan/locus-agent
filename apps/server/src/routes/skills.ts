import type { SkillPreferenceUpdateRequest } from '@locus-agent/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import {
  discoverSkills,
  getSkillDetailById,
  updateSkillPreference,
} from '../services/skills.js'
import { resolveAllowedDirectory } from '../services/workspace-access.js'

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
