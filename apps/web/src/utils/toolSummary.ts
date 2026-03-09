/**
 * Tool-specific summary resolvers.
 * Each entry maps a toolName to a function that returns a summary string from args.
 */
export const toolSummaryResolvers: Record<string, (args: Record<string, unknown>) => string> = {
  bash: args => String(args.command ?? ''),
  read_file: args => String(args.file_path ?? ''),
  glob: args => String(args.pattern ?? ''),
  tree: (args) => {
    const path = String(args.path ?? '')
    const depth = args.max_depth != null ? ` depth=${String(args.max_depth)}` : ''
    return `${path || '.'}${depth}`
  },
  str_replace: args => String(args.file_path ?? ''),
  write_file: args => String(args.file_path ?? ''),
  ask_question: (args) => {
    const questions = args.questions as Array<{ question: string }> | undefined
    if (!questions || questions.length === 0)
      return '提问'
    return questions.length === 1
      ? questions[0]!.question
      : `${questions.length} 个问题`
  },
  delegate: (args) => {
    const agentName = String(args.agent_name ?? args.agent_type ?? '子代理')
    const task = String(args.task ?? '')
    return `${agentName}: ${task.slice(0, 40)}${task.length > 40 ? '...' : ''}`
  },
  manage_todos: (args) => {
    const action = String(args.action ?? '')
    const content = typeof args.content === 'string' ? args.content.trim() : ''
    const status = String(args.status ?? '')
    const taskId = String(args.taskId ?? '')

    if (action === 'add' && content)
      return content

    if (action === 'update') {
      if (content)
        return content
      if (status === 'completed')
        return '标记为已完成'
      if (status === 'in_progress')
        return '标记为进行中'
      if (taskId)
        return `更新任务 ${taskId}`
    }

    if (action === 'delete' && taskId)
      return `删除任务 ${taskId}`
    if (action === 'list')
      return '查看待办'
    if (action === 'clear')
      return '清理待办'

    return '待办管理'
  },
}

/**
 * Tools that render their output via a custom inline widget.
 * When listed here the compact summary row is hidden after completion.
 */
export const toolsWithOutputWidget = new Set<string>(['bash', 'ask_question', 'delegate'])

/**
 * Tools whose summary row is always hidden (they have dedicated cards).
 */
export const toolsHideSummaryRow = new Set<string>(['manage_todos', 'write_plan', 'plan_exit'])
