import { describe, expect, it } from 'vitest'
import { countOccurrences, replaceUniqueString } from './string-replace'

describe('countOccurrences', () => {
  it('should return 0 for empty string', () => {
    expect(countOccurrences('', 'a')).toBe(0)
  })

  it('should return 0 when no match', () => {
    expect(countOccurrences('hello world', 'xyz')).toBe(0)
  })

  it('should return 1 when matched once', () => {
    expect(countOccurrences('hello world', 'world')).toBe(1)
  })

  it('should return correct count for multiple occurrences', () => {
    expect(countOccurrences('ababab', 'ab')).toBe(3)
  })

  it('should not count overlapping substrings', () => {
    expect(countOccurrences('aaa', 'aa')).toBe(1)
  })
})

describe('replaceUniqueString', () => {
  it('should replace when exactly one occurrence', () => {
    const result = replaceUniqueString('hello world', 'world', 'universe')
    expect(result).toEqual({ ok: true, value: 'hello universe' })
  })

  it('should return not_found when no occurrence', () => {
    const result = replaceUniqueString('hello world', 'xyz', 'abc')
    expect(result).toEqual({ ok: false, reason: 'not_found', occurrences: 0 })
  })

  it('should return not_unique when multiple occurrences', () => {
    const result = replaceUniqueString('ababab', 'ab', 'xy')
    expect(result).toEqual({ ok: false, reason: 'not_unique', occurrences: 3 })
  })
})
