import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

function formatRelative(timestamp: number, now: number): string {
  const diff = now - timestamp
  if (diff < 0)
    return '刚刚'
  if (diff < MINUTE)
    return '刚刚'
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE)
    return `${mins}分钟前`
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `${hours}小时前`
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY)
    return `${days}天前`
  }
  if (diff < MONTH) {
    const weeks = Math.floor(diff / WEEK)
    return `${weeks}周前`
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH)
    return `${months}个月前`
  }
  const years = Math.floor(diff / YEAR)
  return `${years}年前`
}

function formatAbsolute(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Returns a reactive relative time string that auto-updates.
 */
export function useRelativeTime(getTimestamp: () => number) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(() => {
      now.value = Date.now()
    }, 30_000) // update every 30s
  })

  onBeforeUnmount(() => {
    if (timer)
      clearInterval(timer)
  })

  const relative = computed(() => formatRelative(getTimestamp(), now.value))
  const absolute = computed(() => formatAbsolute(getTimestamp()))

  return { relative, absolute }
}

/**
 * Pure function version for non-reactive usage.
 */
export { formatAbsolute, formatRelative }
