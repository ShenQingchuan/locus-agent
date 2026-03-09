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
