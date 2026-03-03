export interface ReplaceUniqueStringSuccess {
  ok: true
  value: string
}

export interface ReplaceUniqueStringFailure {
  ok: false
  reason: 'not_found' | 'not_unique'
  occurrences: number
}

export type ReplaceUniqueStringResult = ReplaceUniqueStringSuccess | ReplaceUniqueStringFailure

export function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let pos = 0
  while (true) {
    pos = haystack.indexOf(needle, pos)
    if (pos === -1)
      break
    count++
    pos += needle.length
  }
  return count
}

export function replaceUniqueString(content: string, oldString: string, newString: string): ReplaceUniqueStringResult {
  const occurrences = countOccurrences(content, oldString)
  if (occurrences === 0) {
    return { ok: false, reason: 'not_found', occurrences }
  }
  if (occurrences > 1) {
    return { ok: false, reason: 'not_unique', occurrences }
  }
  return {
    ok: true,
    value: content.replace(oldString, newString),
  }
}
