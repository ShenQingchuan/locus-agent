/**
 * Shared formatting utilities
 */

import type { NoteWithTags } from '../types/knowledge.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Format date as relative time (compact, Chinese locale).
 * Used for note cards, message timestamps, etc.
 */
export function formatRelativeDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60_000)
    return '刚刚'
  if (diff < 3600_000)
    return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < DAY)
    return `${Math.floor(diff / 3600_000)} 小时前`

  const isThisYear = d.getFullYear() === now.getFullYear()
  if (isThisYear)
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Get preview text from note content (first ~120 chars).
 * Handles both plain text and ProseKit editor state.
 */
export function formatNotePreview(note: NoteWithTags, maxLength = 120): string {
  const text = note.content || ''
  if (text.length <= maxLength)
    return text
  return `${text.slice(0, maxLength)}...`
}
