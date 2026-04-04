export function formatTimelineDate(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (dateStart.getTime() === today.getTime()) {
    return '今天'
  }
  if (dateStart.getTime() === yesterday.getTime()) {
    return '昨天'
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatTimelineYear(date: Date): string {
  const now = new Date()
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}年`
  }
  return ''
}
