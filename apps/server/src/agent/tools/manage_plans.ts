import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'

const PLANS_DIR = join(homedir(), '.local', 'share', 'locus-agent', 'coding-plans')

function ensurePlansDir(): void {
  if (!existsSync(PLANS_DIR)) {
    mkdirSync(PLANS_DIR, { recursive: true })
  }
}

// ==================== write_plan ====================

export const writePlanTool = tool({
  description: `Write a coding plan to a Markdown file. Used in Plan mode to persist implementation plans.
File is saved to ~/.local/share/locus-agent/coding-plans/[filename].md
Filename should be descriptive: [plan-goal]-[6-char-id].md (e.g. "add-auth-flow-a3f8k2.md")`,
  inputSchema: z.object({
    filename: z.string()
      .describe('Filename for the plan (must end with .md). Example: "add-auth-flow-a3f8k2.md"'),
    content: z.string()
      .describe('The full Markdown content of the plan'),
  }),
})

export interface WritePlanResult {
  success: boolean
  filePath: string
  message: string
}

export async function executeWritePlan(
  args: { filename: string, content: string },
): Promise<WritePlanResult> {
  const filename = args.filename.trim()
  if (!filename || !filename.endsWith('.md')) {
    return { success: false, filePath: '', message: 'Filename must end with .md' }
  }
  // Prevent directory traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return { success: false, filePath: '', message: 'Filename must not contain path separators' }
  }

  ensurePlansDir()
  const filePath = join(PLANS_DIR, filename)
  writeFileSync(filePath, args.content, 'utf-8')
  return { success: true, filePath, message: `Plan saved: ${filePath}` }
}

export function formatWritePlanResult(result: WritePlanResult): string {
  return result.message
}

// ==================== read_plan ====================

export const readPlanTool = tool({
  description: `Read a coding plan file from ~/.local/share/locus-agent/coding-plans/.
Use action "read" to read a specific file, or "list" to list all available plan files.`,
  inputSchema: z.object({
    action: z.enum(['read', 'list'])
      .describe('"read" to read a specific plan file, "list" to list all plan files'),
    filename: z.string().optional().describe('Plan filename to read (required for "read" action)'),
  }),
})

export interface ReadPlanResult {
  success: boolean
  content?: string
  files?: string[]
  message: string
}

export async function executeReadPlan(
  args: { action: 'read' | 'list', filename?: string },
): Promise<ReadPlanResult> {
  ensurePlansDir()

  if (args.action === 'list') {
    const files = readdirSync(PLANS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
    return { success: true, files, message: `Found ${files.length} plan file(s).` }
  }

  if (args.action === 'read') {
    const filename = args.filename?.trim()
    if (!filename) {
      return { success: false, message: 'Filename is required for read action.' }
    }
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return { success: false, message: 'Invalid filename.' }
    }
    const filePath = join(PLANS_DIR, filename)
    if (!existsSync(filePath)) {
      return { success: false, message: `Plan file not found: ${filename}` }
    }
    const content = readFileSync(filePath, 'utf-8')
    return { success: true, content, message: `Read plan: ${filename} (${content.length} chars)` }
  }

  return { success: false, message: `Unknown action: ${args.action}` }
}

export function formatReadPlanResult(result: ReadPlanResult): string {
  const lines: string[] = [result.message]

  if (result.files) {
    if (result.files.length === 0) {
      lines.push('  (no plan files)')
    }
    else {
      for (const f of result.files) {
        lines.push(`  - ${f}`)
      }
    }
  }

  if (result.content) {
    lines.push('')
    lines.push(result.content)
  }

  return lines.join('\n')
}
