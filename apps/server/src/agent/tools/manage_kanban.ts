import { tool } from 'ai'
import { z } from 'zod'
import { createTask, getTask, linkConversation, listTasks, unlinkConversation, updateTask } from '../../services/task.js'

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
- "get": Get full details of a specific requirement`,
  inputSchema: z.object({
    action: z.enum(['create', 'update', 'list', 'search', 'link', 'unlink', 'get'])
      .describe('Operation to perform on the Kanban board'),
    taskId: z.string().optional().describe('Requirement ID, required for update/link/unlink/get'),
    title: z.string().optional().describe('Requirement title, required for create'),
    spec: z.string().optional().describe('Requirement specification (Markdown). Describes WHAT to build and acceptance criteria'),
    status: z.enum(['backlog', 'in_progress', 'done']).optional().describe('Requirement status: backlog (待跟进), in_progress (进行中), done (已完成)'),
    priority: z.number().min(0).max(3).optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
    keyword: z.string().optional().describe('Search keyword for search action'),
    projectKey: z.string().optional().describe('Project key. Usually auto-detected from the conversation context'),
  }),
})

export interface ManageKanbanResult {
  action: string
  success: boolean
  task?: Awaited<ReturnType<typeof getTask>>
  tasks?: Awaited<ReturnType<typeof listTasks>>
  message: string
}

export async function executeManageKanban(
  args: {
    action: 'create' | 'update' | 'list' | 'search' | 'link' | 'unlink' | 'get'
    taskId?: string
    title?: string
    spec?: string
    status?: 'backlog' | 'in_progress' | 'done'
    priority?: number
    keyword?: string
    projectKey?: string
  },
  context?: { conversationId?: string, projectKey?: string },
): Promise<ManageKanbanResult> {
  const projectKey = args.projectKey || context?.projectKey
  const conversationId = context?.conversationId

  if (args.action === 'create') {
    if (!args.title?.trim()) {
      return { action: 'create', success: false, message: 'Title is required for creating a requirement.' }
    }
    if (!projectKey) {
      return { action: 'create', success: false, message: 'Project key is required. Are you in a coding workspace?' }
    }
    const task = await createTask({
      title: args.title.trim(),
      spec: args.spec?.trim() || '',
      status: args.status || 'backlog',
      priority: args.priority ?? 0,
      projectKey,
      conversationId: conversationId || undefined,
    })
    return { action: 'create', success: true, task, message: `Created requirement: "${task.title}" [${task.status}]` }
  }

  if (args.action === 'update') {
    if (!args.taskId) {
      return { action: 'update', success: false, message: 'Task ID is required for update.' }
    }
    const updated = await updateTask(args.taskId, {
      title: args.title,
      spec: args.spec,
      status: args.status,
      priority: args.priority,
    })
    if (!updated) {
      return { action: 'update', success: false, message: `Requirement ${args.taskId} not found.` }
    }
    return { action: 'update', success: true, task: updated, message: `Updated requirement: "${updated.title}"` }
  }

  if (args.action === 'get') {
    if (!args.taskId) {
      return { action: 'get', success: false, message: 'Task ID is required.' }
    }
    const task = await getTask(args.taskId)
    if (!task) {
      return { action: 'get', success: false, message: `Requirement ${args.taskId} not found.` }
    }
    return { action: 'get', success: true, task, message: `Requirement: "${task.title}"` }
  }

  if (args.action === 'list') {
    if (!projectKey) {
      return { action: 'list', success: false, message: 'Project key is required. Are you in a coding workspace?' }
    }
    const tasks = await listTasks(projectKey)
    return { action: 'list', success: true, tasks, message: `Found ${tasks.length} requirement(s).` }
  }

  if (args.action === 'search') {
    if (!projectKey) {
      return { action: 'search', success: false, message: 'Project key is required.' }
    }
    if (!args.keyword?.trim()) {
      return { action: 'search', success: false, message: 'Keyword is required for search.' }
    }
    const allTasks = await listTasks(projectKey)
    const kw = args.keyword.trim().toLowerCase()
    const matched = allTasks.filter(t =>
      t.title.toLowerCase().includes(kw) || t.spec.toLowerCase().includes(kw),
    )
    return { action: 'search', success: true, tasks: matched, message: `Found ${matched.length} matching requirement(s) for "${args.keyword}".` }
  }

  if (args.action === 'link') {
    if (!args.taskId) {
      return { action: 'link', success: false, message: 'Task ID is required for link.' }
    }
    if (!conversationId) {
      return { action: 'link', success: false, message: 'No active conversation to link.' }
    }
    await linkConversation(args.taskId, conversationId)
    return { action: 'link', success: true, message: `Linked conversation to requirement ${args.taskId}.` }
  }

  if (args.action === 'unlink') {
    if (!args.taskId) {
      return { action: 'unlink', success: false, message: 'Task ID is required for unlink.' }
    }
    if (!conversationId) {
      return { action: 'unlink', success: false, message: 'No active conversation to unlink.' }
    }
    await unlinkConversation(args.taskId, conversationId)
    return { action: 'unlink', success: true, message: `Unlinked conversation from requirement ${args.taskId}.` }
  }

  return { action: args.action, success: false, message: `Unknown action: ${args.action}` }
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

  return lines.join('\n')
}
