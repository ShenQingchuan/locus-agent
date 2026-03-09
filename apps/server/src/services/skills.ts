import type {
  SkillDetail,
  SkillFileNode,
  SkillPreferenceUpdateRequest,
  SkillResource,
  SkillSource,
  SkillSummary,
} from '@locus-agent/agent-sdk'
import { Buffer } from 'node:buffer'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { eq } from 'drizzle-orm'
import { db, settings as settingsTable } from '../db/index.js'
import { getSkillsDataDir } from '../settings/index.js'

const SETTINGS_KEY = 'skills.preferences.v1'
const SKILL_ENTRY_FILENAME = 'SKILL.md'

interface SkillPreferenceOverrides {
  enabled?: boolean
  modelInvocable?: boolean
  userInvocable?: boolean
}

interface SkillPreferencesRecord {
  overrides: Record<string, SkillPreferenceOverrides>
}

interface ParsedSkillFile {
  frontmatter: Record<string, unknown>
  rawFrontmatter: string
  content: string
}

interface InternalSkillRecord {
  summary: SkillSummary
  detail: SkillDetail
}

interface DiscoverSkillsOptions {
  workspaceRoot?: string
}

interface DiscoverSkillsResult {
  workspaceRoot?: string
  skills: SkillSummary[]
  detailsById: Map<string, SkillDetail>
  effectiveByName: Map<string, SkillSummary>
}

function encodeSkillId(source: SkillSource, filePath: string): string {
  return Buffer.from(`${source}:${filePath}`).toString('base64url')
}

function decodeScalarValue(rawValue: string): unknown {
  const value = rawValue.trim()
  if (!value)
    return ''
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1)
  }
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  if (value === 'null')
    return null
  if (/^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value)
  return value
}

function parseFrontmatterBlock(rawFrontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = rawFrontmatter.split(/\r?\n/)

  let index = 0
  while (index < lines.length) {
    const line = lines[index]!.replace(/\t/g, '  ')
    if (!line.trim() || line.trim().startsWith('#')) {
      index += 1
      continue
    }

    const topLevelMatch = line.match(/^([\w-]+):(.*)$/)
    if (!topLevelMatch) {
      index += 1
      continue
    }

    const [, key, inlineRaw = ''] = topLevelMatch
    const inlineValue = inlineRaw.trimStart()

    if (inlineValue === '>' || inlineValue === '|') {
      const blockLines: string[] = []
      index += 1
      while (index < lines.length) {
        const nextLine = lines[index]!
        if (!nextLine.startsWith(' '))
          break
        blockLines.push(nextLine.replace(/^\s{2}/, ''))
        index += 1
      }
      result[key] = inlineValue === '>'
        ? blockLines.join(' ').replace(/\s+/g, ' ').trim()
        : blockLines.join('\n').trim()
      continue
    }

    if (!inlineValue) {
      const nestedEntries: Record<string, unknown> = {}
      index += 1
      while (index < lines.length) {
        const nextLine = lines[index]!
        if (!nextLine.startsWith('  '))
          break
        const nestedMatch = nextLine.match(/^\s{2}([\w-]+):(.*)$/)
        if (nestedMatch) {
          const [, nestedKey, nestedValue = ''] = nestedMatch
          nestedEntries[nestedKey] = decodeScalarValue(nestedValue.trimStart())
        }
        index += 1
      }
      result[key] = Object.keys(nestedEntries).length > 0 ? nestedEntries : ''
      continue
    }

    result[key] = decodeScalarValue(inlineValue)
    index += 1
  }

  return result
}

function parseSkillFileContent(rawContent: string): ParsedSkillFile {
  if (!rawContent.startsWith('---\n') && !rawContent.startsWith('---\r\n')) {
    return {
      frontmatter: {},
      rawFrontmatter: '',
      content: rawContent.trim(),
    }
  }

  const closingMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!closingMatch) {
    return {
      frontmatter: {},
      rawFrontmatter: '',
      content: rawContent.trim(),
    }
  }

  const rawFrontmatter = closingMatch[1] ?? ''
  const content = rawContent.slice(closingMatch[0].length).trim()

  return {
    frontmatter: parseFrontmatterBlock(rawFrontmatter),
    rawFrontmatter,
    content,
  }
}

function inferDescription(content: string): string {
  return content
    .split(/\r?\n\r?\n/)
    .map(item => item.trim())
    .find(Boolean)
    ?.replace(/^#+\s*/, '')
    .slice(0, 1024) || 'No description provided.'
}

function classifyResource(relativePath: string): SkillResource['type'] {
  if (relativePath.startsWith('scripts/'))
    return 'script'
  if (relativePath.startsWith('reference/') || relativePath.startsWith('references/'))
    return 'reference'
  if (relativePath.startsWith('assets/'))
    return 'asset'
  return 'other'
}

async function collectSkillResources(rootDir: string, currentDir = rootDir): Promise<SkillResource[]> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  const resources: SkillResource[] = []

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name)
    if (entry.isDirectory()) {
      resources.push(...await collectSkillResources(rootDir, absolutePath))
      continue
    }
    if (!entry.isFile())
      continue

    const relativePath = relative(rootDir, absolutePath).split('\\').join('/')
    if (relativePath === SKILL_ENTRY_FILENAME)
      continue

    resources.push({
      path: relativePath,
      type: classifyResource(relativePath),
    })
  }

  resources.sort((a, b) => a.path.localeCompare(b.path))
  return resources
}

async function readSkillPreferences(): Promise<SkillPreferencesRecord> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY))
    .limit(1)

  if (!row?.value) {
    return { overrides: {} }
  }

  try {
    const parsed = JSON.parse(row.value) as Partial<SkillPreferencesRecord>
    return {
      overrides: parsed.overrides ?? {},
    }
  }
  catch {
    return { overrides: {} }
  }
}

async function writeSkillPreferences(preferences: SkillPreferencesRecord): Promise<void> {
  const serialized = JSON.stringify(preferences)
  const [existing] = await db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db
      .update(settingsTable)
      .set({ value: serialized, updatedAt: new Date() })
      .where(eq(settingsTable.key, SETTINGS_KEY))
    return
  }

  await db.insert(settingsTable).values({ key: SETTINGS_KEY, value: serialized })
}

async function loadSkillRecord(
  skillFilePath: string,
  source: SkillSource,
  preferences: SkillPreferencesRecord,
  scopePath?: string,
): Promise<InternalSkillRecord> {
  const rootDir = dirname(skillFilePath)
  const rawContent = await readFile(skillFilePath, 'utf-8')
  const parsed = parseSkillFileContent(rawContent)
  const stats = await stat(skillFilePath)
  const resources = await collectSkillResources(rootDir)
  const id = encodeSkillId(source, skillFilePath)
  const defaultName = basename(rootDir)
  const name = typeof parsed.frontmatter.name === 'string' && parsed.frontmatter.name.trim()
    ? parsed.frontmatter.name.trim()
    : defaultName
  const description = typeof parsed.frontmatter.description === 'string' && parsed.frontmatter.description.trim()
    ? parsed.frontmatter.description.trim()
    : inferDescription(parsed.content)
  const overrides = preferences.overrides[id] ?? {}
  const defaultModelInvocable = parsed.frontmatter['disable-model-invocation'] !== true
  const defaultUserInvocable = parsed.frontmatter['user-invocable'] !== false
  const enabled = overrides.enabled ?? true
  const modelInvocable = overrides.modelInvocable ?? defaultModelInvocable
  const userInvocable = overrides.userInvocable ?? defaultUserInvocable

  const summary: SkillSummary = {
    id,
    name,
    description,
    source,
    path: skillFilePath,
    rootDir,
    scopePath,
    enabled,
    modelInvocable,
    userInvocable,
    effective: false,
    updatedAt: stats.mtime.toISOString(),
    resourceCount: resources.length,
    hasScripts: resources.some(resource => resource.type === 'script'),
    hasReferences: resources.some(resource => resource.type === 'reference'),
    hasAssets: resources.some(resource => resource.type === 'asset'),
  }

  return {
    summary,
    detail: {
      ...summary,
      content: parsed.content,
      rawFrontmatter: parsed.rawFrontmatter,
      frontmatter: parsed.frontmatter,
      resources,
    },
  }
}

async function discoverSkillFilesInDirectory(skillsDir: string): Promise<string[]> {
  if (!existsSync(skillsDir)) {
    return []
  }

  const entries = await readdir(skillsDir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory())
      continue
    const skillFilePath = join(skillsDir, entry.name, SKILL_ENTRY_FILENAME)
    if (existsSync(skillFilePath)) {
      results.push(skillFilePath)
    }
  }

  results.sort((a, b) => a.localeCompare(b))
  return results
}

export async function discoverSkills(options: DiscoverSkillsOptions = {}): Promise<DiscoverSkillsResult> {
  const preferences = await readSkillPreferences()
  const systemSkillFiles = await discoverSkillFilesInDirectory(getSkillsDataDir())
  const projectSkillFiles = options.workspaceRoot
    ? await discoverSkillFilesInDirectory(join(options.workspaceRoot, '.agents', 'skills'))
    : []

  const records = await Promise.all([
    ...systemSkillFiles.map(filePath => loadSkillRecord(filePath, 'system', preferences)),
    ...projectSkillFiles.map(filePath => loadSkillRecord(filePath, 'project', preferences, options.workspaceRoot)),
  ])

  const sorted = records.sort((a, b) => {
    const priorityA = a.summary.source === 'project' ? 1 : 0
    const priorityB = b.summary.source === 'project' ? 1 : 0
    if (priorityA !== priorityB)
      return priorityB - priorityA
    return a.summary.name.localeCompare(b.summary.name)
  })

  const winnerByName = new Map<string, string>()
  for (const record of sorted) {
    if (!record.summary.enabled) {
      continue
    }
    if (!winnerByName.has(record.summary.name)) {
      winnerByName.set(record.summary.name, record.summary.id)
    }
  }

  const skills = sorted.map(({ summary }) => ({ ...summary }))
  const detailsById = new Map<string, SkillDetail>()
  const effectiveByName = new Map<string, SkillSummary>()

  for (const record of records) {
    const effectiveId = winnerByName.get(record.summary.name)
    const isEffective = record.summary.enabled && effectiveId === record.summary.id
    const nextSummary: SkillSummary = {
      ...record.summary,
      effective: isEffective,
      overriddenById: isEffective ? undefined : effectiveId,
    }
    const nextDetail: SkillDetail = {
      ...record.detail,
      effective: isEffective,
      overriddenById: isEffective ? undefined : effectiveId,
    }

    const skillIndex = skills.findIndex(item => item.id === record.summary.id)
    if (skillIndex >= 0) {
      skills[skillIndex] = nextSummary
    }
    detailsById.set(nextDetail.id, nextDetail)
    if (isEffective) {
      effectiveByName.set(nextSummary.name, nextSummary)
    }
  }

  skills.sort((a, b) => {
    if (a.source !== b.source)
      return a.source === 'project' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return {
    workspaceRoot: options.workspaceRoot,
    skills,
    detailsById,
    effectiveByName,
  }
}

export async function getSkillDetailById(id: string, options: DiscoverSkillsOptions = {}): Promise<SkillDetail | null> {
  const discovered = await discoverSkills(options)
  return discovered.detailsById.get(id) ?? null
}

export async function updateSkillPreference(
  payload: SkillPreferenceUpdateRequest,
  options: DiscoverSkillsOptions = {},
): Promise<SkillSummary | null> {
  const discovered = await discoverSkills(options)
  const skill = discovered.skills.find(item => item.id === payload.id)
  if (!skill) {
    return null
  }

  const preferences = await readSkillPreferences()
  preferences.overrides[payload.id] = {
    ...preferences.overrides[payload.id],
    ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
    ...(payload.modelInvocable !== undefined ? { modelInvocable: payload.modelInvocable } : {}),
    ...(payload.userInvocable !== undefined ? { userInvocable: payload.userInvocable } : {}),
  }
  await writeSkillPreferences(preferences)

  const refreshed = await discoverSkills(options)
  return refreshed.skills.find(item => item.id === payload.id) ?? null
}

export async function getModelInvocableSkillCatalog(workspaceRoot?: string): Promise<SkillSummary[]> {
  const discovered = await discoverSkills({ workspaceRoot })
  return discovered.skills.filter(skill => skill.effective && skill.enabled && skill.modelInvocable)
}

export async function getSkillFileTree(skillRootDir: string): Promise<SkillFileNode[]> {
  if (!existsSync(skillRootDir)) {
    return []
  }

  async function walkDir(dir: string): Promise<SkillFileNode[]> {
    const entries = await readdir(dir, { withFileTypes: true })
    const nodes: SkillFileNode[] = []

    // Sort: directories first, then files, alphabetically within each group
    const sorted = entries.slice().sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory())
        return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
      const fullPath = join(dir, entry.name)
      const relPath = relative(skillRootDir, fullPath).split('\\').join('/')

      if (entry.isDirectory()) {
        const children = await walkDir(fullPath)
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children,
        })
      }
      else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
        })
      }
    }

    return nodes
  }

  return walkDir(skillRootDir)
}

export async function createSkill(options: {
  name: string
  source: SkillSource
  workspaceRoot?: string
  description?: string
}): Promise<SkillSummary> {
  const { name, source, workspaceRoot, description } = options

  // Validate name (alphanumeric + hyphens only)
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new Error('Skill name must be lowercase alphanumeric with optional hyphens, and cannot start or end with a hyphen')
  }

  // Determine target directory
  let skillsDir: string
  if (source === 'project') {
    if (!workspaceRoot) {
      throw new Error('workspaceRoot is required for project skills')
    }
    skillsDir = join(workspaceRoot, '.agents', 'skills')
  }
  else {
    skillsDir = getSkillsDataDir()
  }

  const skillDir = join(skillsDir, name)
  const skillFilePath = join(skillDir, SKILL_ENTRY_FILENAME)

  if (existsSync(skillDir)) {
    throw new Error(`Skill "${name}" already exists at ${skillDir}`)
  }

  // Create directory structure
  await mkdir(skillDir, { recursive: true })

  // Create SKILL.md with basic frontmatter
  const desc = description || `${name} skill`
  const content = `---
name: ${name}
description: >
  ${desc}
---

# ${name}

<!-- Write your skill instructions here -->
`
  await writeFile(skillFilePath, content, 'utf-8')

  // Re-discover and return the new skill
  const discovered = await discoverSkills({ workspaceRoot })
  const newSkill = discovered.skills.find(s => s.name === name && s.source === source)
  if (!newSkill) {
    throw new Error('Skill was created but could not be found in discovery')
  }

  return newSkill
}

function inferLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const langMap: Record<string, string> = {
    md: 'markdown',
    markdown: 'markdown',
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    css: 'css',
    html: 'html',
    xml: 'xml',
    sql: 'sql',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    txt: 'plaintext',
  }
  return langMap[ext] ?? 'plaintext'
}

export async function readSkillFile(
  skillRootDir: string,
  relativeFilePath: string,
): Promise<{ content: string, language: string }> {
  // Security: ensure the path doesn't escape the skill directory
  const resolved = join(skillRootDir, relativeFilePath)
  const normalizedResolved = resolved.split('\\').join('/')
  const normalizedRoot = skillRootDir.split('\\').join('/')
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error('Path traversal detected')
  }

  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${relativeFilePath}`)
  }

  const content = await readFile(resolved, 'utf-8')
  const language = inferLanguageFromPath(relativeFilePath)
  return { content, language }
}

export async function writeSkillFile(
  skillRootDir: string,
  relativeFilePath: string,
  content: string,
): Promise<void> {
  // Security: ensure the path doesn't escape the skill directory
  const resolved = join(skillRootDir, relativeFilePath)
  const normalizedResolved = resolved.split('\\').join('/')
  const normalizedRoot = skillRootDir.split('\\').join('/')
  if (!normalizedResolved.startsWith(normalizedRoot)) {
    throw new Error('Path traversal detected')
  }

  // Ensure parent directory exists
  const parentDir = dirname(resolved)
  if (!existsSync(parentDir)) {
    await mkdir(parentDir, { recursive: true })
  }

  await writeFile(resolved, content, 'utf-8')
}

export async function activateSkillForAgent(name: string, workspaceRoot?: string): Promise<string> {
  const catalog = await getModelInvocableSkillCatalog(workspaceRoot)
  const skill = catalog.find(item => item.name === name)
  if (!skill) {
    throw new Error(`Skill "${name}" is not available`)
  }

  const detail = await getSkillDetailById(skill.id, { workspaceRoot })
  if (!detail) {
    throw new Error(`Failed to load skill "${name}"`)
  }

  const resourceFiles = detail.resources
    .map(resource => `<file>${join(detail.rootDir, resource.path)}</file>`)
    .join('\n')

  return `<skill_content name="${detail.name}" source="${detail.source}">
${detail.content}

Skill directory: ${detail.rootDir}
Relative paths in this skill are relative to this directory.

<skill_resources>
${resourceFiles}
</skill_resources>
</skill_content>`
}
