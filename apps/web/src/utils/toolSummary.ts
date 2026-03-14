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
  manage_memory: (args) => {
    const action = String(args.action ?? '')
    if (action === 'create') {
      const memories = (args.memories as Array<{ content?: string }>) ?? []
      return memories.length > 0 ? `保存 ${memories.length} 条记忆` : '保存记忆'
    }
    if (action === 'read') {
      const q = typeof args.query === 'string' ? args.query : ''
      const tags = (args.tags as string[] | undefined) ?? []
      if (q && tags.length)
        return `搜索记忆: "${q.slice(0, 20)}..." + ${tags.length} 个标签`
      if (q)
        return `搜索记忆: "${q.slice(0, 30)}${q.length > 30 ? '...' : ''}"`
      if (tags.length)
        return `按标签搜索记忆: ${tags.join(', ')}`
      return '搜索记忆'
    }
    if (action === 'update') {
      const id = String(args.memory_id ?? '')
      return id ? `更新记忆 ${id.slice(0, 8)}...` : '更新记忆'
    }
    if (action === 'delete') {
      const ids = (args.memory_ids as string[] | undefined) ?? []
      return ids.length > 0 ? `删除 ${ids.length} 条记忆` : '删除记忆'
    }
    return '管理记忆'
  },
  search_memory: (args) => {
    const action = String(args.action ?? '')
    if (action === 'list')
      return '浏览记忆'
    if (action === 'read') {
      const q = typeof args.query === 'string' ? args.query : ''
      const tags = (args.tags as string[] | undefined) ?? []
      if (q)
        return `搜索记忆: "${q.slice(0, 30)}${q.length > 30 ? '...' : ''}"`
      if (tags.length)
        return `按标签搜索记忆: ${tags.join(', ')}`
      return '搜索记忆'
    }
    return '查询记忆'
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
