/** Arg keys tried first for ACP compact one-line summary. */
export const ACP_SUMMARY_HEURISTIC_KEYS = [
  'file_path',
  'command',
  'pattern',
  'query',
  'prompt',
  'path',
  'task',
  'description',
] as const

/** Delegate agent types shown as compact inline rows. */
export const INLINE_DELEGATE_AGENT_TYPES = new Set([
  'memory_tagger',
  'memory-tagger',
])
