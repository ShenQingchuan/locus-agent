import { getModelInvocableSkillCatalog } from '../../services/skills.js'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export async function buildSkillsCatalogPrompt(workspaceRoot?: string): Promise<string> {
  const skills = await getModelInvocableSkillCatalog(workspaceRoot)
  if (skills.length === 0) {
    return ''
  }

  const serialized = skills
    .map(skill => `  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <description>${escapeXml(skill.description)}</description>\n    <source>${escapeXml(skill.source)}</source>\n  </skill>`)
    .join('\n')

  return `## Skills

The following Agent Skills are available in this session. Skills are specialized, on-demand capability packs.
When a task clearly matches a skill description, call the \`skill\` tool with the skill's exact name before proceeding.
Do not call \`skill\` repeatedly for the same skill unless you need to reload it.

<available_skills>
${serialized}
</available_skills>`
}
