/** Shiki 语言 ID 别名 */
const LANG_ALIASES: Record<string, string> = {
  'sh': 'bash',
  'zsh': 'bash',
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'yml': 'yaml',
  'c++': 'cpp',
}

/** 语言 ID/别名 -> 可读显示名 */
const LANG_DISPLAY_NAMES: Record<string, string> = {
  'typescript': 'TypeScript',
  'ts': 'TypeScript',
  'javascript': 'JavaScript',
  'js': 'JavaScript',
  'python': 'Python',
  'py': 'Python',
  'bash': 'Bash',
  'sh': 'Bash',
  'zsh': 'Bash',
  'yaml': 'YAML',
  'yml': 'YAML',
  'cpp': 'C++',
  'c++': 'C++',
  'c': 'C',
  'csharp': 'C#',
  'cs': 'C#',
  'go': 'Go',
  'golang': 'Go',
  'rust': 'Rust',
  'rs': 'Rust',
  'ruby': 'Ruby',
  'rb': 'Ruby',
  'php': 'PHP',
  'java': 'Java',
  'kotlin': 'Kotlin',
  'kt': 'Kotlin',
  'swift': 'Swift',
  'sql': 'SQL',
  'json': 'JSON',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'markdown': 'Markdown',
  'md': 'Markdown',
  'xml': 'XML',
  'diff': 'Diff',
  'patch': 'Diff',
  'txt': 'Plain Text',
  'text': 'Plain Text',
  'plaintext': 'Plain Text',
  'plain_text': 'Plain Text',
  'vue': 'Vue',
  'svelte': 'Svelte',
  'solid': 'Solid',
}

export function getCodeBlockDisplayName(lang: string): string {
  const key = (lang || 'text').toLowerCase().trim()
  const resolved = LANG_ALIASES[key] || key
  return LANG_DISPLAY_NAMES[key] ?? LANG_DISPLAY_NAMES[resolved] ?? capitalizeFirst(key)
}

export function getResolvedLang(lang: string): string {
  return LANG_ALIASES[(lang || 'text').toLowerCase()] || (lang || 'text')
}

function capitalizeFirst(s: string): string {
  if (!s)
    return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Popover 语言选项：id 用于 Shiki/存储，name 用于显示 */
export const CODE_BLOCK_LANG_OPTIONS: { id: string, name: string }[] = [
  { id: 'text', name: 'Plain Text' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'bash', name: 'Bash' },
  { id: 'json', name: 'JSON' },
  { id: 'yaml', name: 'YAML' },
  { id: 'html', name: 'HTML' },
  { id: 'css', name: 'CSS' },
  { id: 'markdown', name: 'Markdown' },
  { id: 'sql', name: 'SQL' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
  { id: 'java', name: 'Java' },
  { id: 'c', name: 'C' },
  { id: 'cpp', name: 'C++' },
]
