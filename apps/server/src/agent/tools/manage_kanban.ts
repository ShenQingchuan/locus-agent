import { tool } from 'ai'
import { z } from 'zod'
import {
  createTask,
  getLatestTaskByConversation,
  getTask,
  linkConversation,
  listTasks,
  unlinkConversation,
  updateTask,
} from '../../services/task.js'
import { replaceUniqueString } from './string-replace.js'

const statusSchema = z.enum(['backlog', 'in_progress', 'done'])
const actionSchema = z.enum([
  'create',
  'update',
  'list',
  'search',
  'link',
  'unlink',
  'get',
  'context.write',
  'context.patch',
  'context.get',
])

const manageKanbanInputSchema = z.object({
  action: actionSchema.optional().describe('Operation to perform on the Kanban board'),
  taskId: z.string().optional().describe('Requirement ID. Optional when current conversation is already bound'),
  title: z.string().optional().describe('Requirement title, required for create'),
  spec: z.string().optional().describe('Requirement specification (Markdown)'),
  contextMarkdown: z.string().optional().describe('Reusable editing context in Markdown'),
  markdown: z.string().optional().describe('Full markdown content for context.write'),
  old_string: z.string().optional().describe('Exact old text to replace in context.patch'),
  new_string: z.string().optional().describe('Replacement text in context.patch'),
  status: statusSchema.optional().describe('Requirement status'),
  priority: z.number().min(0).max(3).optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
  keyword: z.string().optional().describe('Search keyword for search action'),
  projectKey: z.string().optional().describe('Project key. Usually auto-detected from the conversation context'),
})

export const manageKanbanTool = tool({
  description: `
Manage the Kanban board (requirements backlog).
Use this tool to create, update, search, list, or link requirements to the current conversation.

Actions:
- "create": Create a new requirement card in the Kanban board
- "update": Update an existing requirement (title, spec, status, priority)
- "list": List all requirements for the current project
- "search": Search requirements by keyword in title/spec
- "link": Link the current conversation to a requirement
- "unlink": Unlink the current conversation from a requirement
- "get": Get full details of a specific requirement
- "context.write": Overwrite reusable context markdown for a requirement
- "context.patch": Patch context markdown using exact string replacement
- "context.get": Get reusable context markdown for a requirement`,
  inputSchema: manageKanbanInputSchema,
})

export interface ManageKanbanResult {
  action: string
  success: boolean
  task?: Awaited<ReturnType<typeof getTask>>
  tasks?: Awaited<ReturnType<typeof listTasks>>
  message: string
}

type ManageKanbanArgs = z.infer<typeof manageKanbanInputSchema>

async function resolveTaskForAction(
  taskId: string | undefined,
  context?: { conversationId?: string },
): Promise<Awaited<ReturnType<typeof getTask>>> {
  if (taskId)
    return getTask(taskId)
  if (!context?.conversationId)
    return null
  return getLatestTaskByConversation(context.conversationId)
}

export async function executeManageKanban(
  args: ManageKanbanArgs | Record<string, unknown>,
  context?: { conversationId?: string, projectKey?: string },
): Promise<ManageKanbanResult> {
  const parsedArgs = manageKanbanInputSchema.safeParse(args)
  if (!parsedArgs.success) {
    const rawAction = typeof args?.action === 'string' ? args.action : ''
    if (!rawAction) {
      const linkedTask = await resolveTaskForAction(undefined, context)
      if (linkedTask) {
        return {
          action: 'get',
          success: true,
          task: linkedTask,
          message: `No action provided. Auto-selected linked requirement: "${linkedTask.title}".`,
        }
      }
      if (context?.projectKey) {
        const tasks = await listTasks(context.projectKey)
        return {
          action: 'list',
          success: true,
          tasks,
          message: `No action provided. Auto-listed ${tasks.length} requirement(s) for current project.`,
        }
      }
      return {
        action: 'unknown',
        success: false,
        message: 'Missing action. Please provide action like "create", "update", "get", or "context.get".',
      }
    }
    return {
      action: rawAction,
      success: false,
      message: `Invalid arguments for action "${rawAction}". Please check required fields for this action.`,
    }
  }

  const normalizedArgs = parsedArgs.data
  if (!normalizedArgs.action) {
    const linkedTask = await resolveTaskForAction(undefined, context)
    if (linkedTask) {
      return {
        action: 'get',
        success: true,
        task: linkedTask,
        message: `No action provided. Auto-selected linked requirement: "${linkedTask.title}".`,
      }
    }
    if (context?.projectKey) {
      const tasks = await listTasks(context.projectKey)
      return {
        action: 'list',
        success: true,
        tasks,
        message: `No action provided. Auto-listed ${tasks.length} requirement(s) for current project.`,
      }
    }
    return {
      action: 'unknown',
      success: false,
      message: 'Missing action. Please provide action like "create", "update", "get", or "context.get".',
    }
  }

  const projectKey = ('projectKey' in normalizedArgs ? normalizedArgs.projectKey : undefined) || context?.projectKey
  const conversationId = context?.conversationId

  if (normalizedArgs.action === 'create') {
    if (!normalizedArgs.title?.trim()) {
      return { action: 'create', success: false, message: 'Title is required for creating a requirement.' }
    }
    if (!projectKey) {
      return { action: 'create', success: false, message: 'Project key is required. Are you in a coding workspace?' }
    }
    const task = await createTask({
      title: normalizedArgs.title.trim(),
      spec: normalizedArgs.spec?.trim() || '',
      contextMarkdown: normalizedArgs.contextMarkdown ?? '',
      status: 'backlog',
      priority: normalizedArgs.priority ?? 0,
      projectKey,
      conversationId: conversationId || undefined,
    })
    return { action: 'create', success: true, task, message: `Created requirement: "${task.title}" [${task.status}]` }
  }

  if (normalizedArgs.action === 'update') {
    const task = await resolveTaskForAction(normalizedArgs.taskId, context)
    if (!task) {
      return { action: 'update', success: false, message: 'Requirement ID is required or no requirement is linked to this conversation.' }
    }
    const updated = await updateTask(task.id, {
      title: normalizedArgs.title,
      spec: normalizedArgs.spec,
      contextMarkdown: normalizedArgs.contextMarkdown,
      status: normalizedArgs.status,
      priority: normalizedArgs.priority,
    })
    if (!updated) {
      return { action: 'update', success: false, message: `Requirement ${task.id} not found.` }
    }
    return { action: 'update', success: true, task: updated, message: `Updated requirement: "${updated.title}"` }
  }

  if (normalizedArgs.action === 'get') {
    const task = await resolveTaskForAction(normalizedArgs.taskId, context)
    if (!task) {
      return { action: 'get', success: false, message: 'Requirement ID is required or no requirement is linked to this conversation.' }
    }
    return { action: 'get', success: true, task, message: `Requirement: "${task.title}"` }
  }

  if (normalizedArgs.action === 'list') {
    if (!projectKey) {
      return { action: 'list', success: false, message: 'Project key is required. Are you in a coding workspace?' }
    }
    const tasks = await listTasks(projectKey)
    return { action: 'list', success: true, tasks, message: `Found ${tasks.length} requirement(s).` }
  }

  if (normalizedArgs.action === 'search') {
    if (!projectKey) {
      return { action: 'search', success: false, message: 'Project key is required.' }
    }
    if (!normalizedArgs.keyword?.trim()) {
      return { action: 'search', success: false, message: 'Keyword is required for search.' }
    }
    const allTasks = await listTasks(projectKey)
    const kw = normalizedArgs.keyword.trim().toLowerCase()
    const matched = allTasks.filter(t =>
      t.title.toLowerCase().includes(kw)
      || t.spec.toLowerCase().includes(kw)
      || t.contextMarkdown.toLowerCase().includes(kw),
    )
    return { action: 'search', success: true, tasks: matched, message: `Found ${matched.length} matching requirement(s) for "${normalizedArgs.keyword}".` }
  }

  if (normalizedArgs.action === 'link') {
    if (!normalizedArgs.taskId) {
      return { action: 'link', success: false, message: 'Task ID is required for link.' }
    }
    if (!conversationId) {
      return { action: 'link', success: false, message: 'No active conversation to link.' }
    }
    await linkConversation(normalizedArgs.taskId, conversationId)
    return { action: 'link', success: true, message: `Linked conversation to requirement ${normalizedArgs.taskId}.` }
  }

  if (normalizedArgs.action === 'unlink') {
    if (!normalizedArgs.taskId) {
      return { action: 'unlink', success: false, message: 'Task ID is required for unlink.' }
    }
    if (!conversationId) {
      return { action: 'unlink', success: false, message: 'No active conversation to unlink.' }
    }
    await unlinkConversation(normalizedArgs.taskId, conversationId)
    return { action: 'unlink', success: true, message: `Unlinked conversation from requirement ${normalizedArgs.taskId}.` }
  }

  if (normalizedArgs.action === 'context.write') {
    if (normalizedArgs.markdown === undefined) {
      return { action: 'context.write', success: false, message: 'markdown is required for context.write.' }
    }
    const task = await resolveTaskForAction(normalizedArgs.taskId, context)
    if (!task) {
      return { action: 'context.write', success: false, message: 'Requirement ID is required or no requirement is linked to this conversation.' }
    }
    const updated = await updateTask(task.id, { contextMarkdown: normalizedArgs.markdown })
    if (!updated) {
      return { action: 'context.write', success: false, message: `Requirement ${task.id} not found.` }
    }
    return {
      action: 'context.write',
      success: true,
      task: updated,
      message: `Context markdown updated for requirement ${updated.id}.`,
    }
  }

  if (normalizedArgs.action === 'context.patch') {
    if (!normalizedArgs.old_string) {
      return { action: 'context.patch', success: false, message: 'old_string is required for context.patch.' }
    }
    if (normalizedArgs.new_string === undefined) {
      return { action: 'context.patch', success: false, message: 'new_string is required for context.patch.' }
    }
    const task = await resolveTaskForAction(normalizedArgs.taskId, context)
    if (!task) {
      return { action: 'context.patch', success: false, message: 'Requirement ID is required or no requirement is linked to this conversation.' }
    }

    const replaced = replaceUniqueString(task.contextMarkdown ?? '', normalizedArgs.old_string, normalizedArgs.new_string)
    if (!replaced.ok) {
      if (replaced.reason === 'not_found') {
        return {
          action: 'context.patch',
          success: false,
          message: 'Patch failed: old_string not found in context markdown.',
        }
      }
      return {
        action: 'context.patch',
        success: false,
        message: `Patch failed: old_string matched ${replaced.occurrences} locations (must be unique).`,
      }
    }

    const updated = await updateTask(task.id, { contextMarkdown: replaced.value })
    if (!updated) {
      return { action: 'context.patch', success: false, message: `Requirement ${task.id} not found.` }
    }

    return {
      action: 'context.patch',
      success: true,
      task: updated,
      message: `Context markdown patched for requirement ${updated.id}.`,
    }
  }

  const task = await resolveTaskForAction(normalizedArgs.taskId, context)
  if (!task) {
    return { action: 'context.get', success: false, message: 'Requirement ID is required or no requirement is linked to this conversation.' }
  }
  return {
    action: 'context.get',
    success: true,
    task,
    message: `Fetched context markdown for requirement ${task.id}.`,
  }
}

export function formatManageKanbanResult(result: ManageKanbanResult): string {
  const lines: string[] = [result.message]

  if (result.task) {
    const t = result.task
    const statusLabels: Record<string, string> = { backlog: '待跟进', in_progress: '进行中', done: '已完成' }
    const priorityLabels: Record<number, string> = { 0: '-', 1: '低', 2: '中', 3: '高' }
    lines.push('')
    lines.push(`  ID: ${t.id}`)
    lines.push(`  标题: ${t.title}`)
    lines.push(`  状态: ${statusLabels[t.status] || t.status}`)
    lines.push(`  优先级: ${priorityLabels[t.priority] || t.priority}`)
    if (t.spec) {
      const preview = t.spec.length > 200 ? `${t.spec.slice(0, 200)}...` : t.spec
      lines.push(`  Spec: ${preview}`)
    }
    if (t.contextMarkdown) {
      const preview = t.contextMarkdown.length > 200 ? `${t.contextMarkdown.slice(0, 200)}...` : t.contextMarkdown
      lines.push(`  Context: ${preview}`)
    }
  }

  if (result.tasks) {
    const statusLabels: Record<string, string> = { backlog: '待跟进', in_progress: '进行中', done: '已完成' }
    lines.push('')
    if (result.tasks.length === 0) {
      lines.push('  (empty)')
    }
    else {
      for (const t of result.tasks) {
        const specPreview = t.spec ? ` — ${t.spec.replace(/[\n#*`>\-[\]]/g, '').slice(0, 60)}` : ''
        lines.push(`  [${statusLabels[t.status] || t.status}] ${t.title} (${t.id})${specPreview}`)
      }
    }
  }

  if (result.action === 'context.get' && result.task) {
    lines.push('')
    lines.push(result.task.contextMarkdown || '(empty context markdown)')
  }

  return lines.join('\n')
}
