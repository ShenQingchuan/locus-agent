import { tool } from 'ai'
import { z } from 'zod'
import { activateSkillForAgent } from '../../services/skills.js'

export const skillTool = tool({
  description:
    'Load a discovered Agent Skill by name. '
    + 'Use this when a task matches an available skill description and you need the full skill instructions before proceeding.',
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .describe('The skill name to load, exactly as shown in the available skills catalog.'),
  }),
})

export interface SkillToolResult {
  name: string
  content: string
}

export async function executeSkill(args: { name: string }, workspaceRoot?: string): Promise<SkillToolResult> {
  const name = args.name.trim()
  if (!name) {
    throw new Error('Skill name is required')
  }

  return {
    name,
    content: await activateSkillForAgent(name, workspaceRoot),
  }
}

export function formatSkillResult(result: SkillToolResult): string {
  return result.content
}
