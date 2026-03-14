export interface SlashMenuCommand {
  /** Display name (also used for fuzzy filtering) */
  name: string
  /** Short description shown below name */
  description?: string
  /** Section header this command belongs to (e.g. "Skills", "Actions") */
  section: string
  /** UnoCSS icon class */
  icon?: string
  /** Optional badge text (e.g. "系统", "项目") */
  badge?: string
  /** Badge color variant */
  badgeVariant?: 'info' | 'warning' | 'default'
  /** Text to insert when selected (replaces the `/query` match) */
  insertText: string
}

export interface WorkspaceMentionItem {
  /** Unique id used as mention attr id */
  id: string
  /** Display label (file/directory name) */
  label: string
  /** Full text used for autocomplete filtering */
  searchText: string
  /** Absolute path on disk */
  absolutePath: string
  /** Path shown in the mention tag (relative or absolute) */
  displayPath: string
  /** Mention kind: 'file-mention' | 'dir-mention' */
  kind: 'file-mention' | 'dir-mention'
  /** UnoCSS icon class */
  icon: string
}
