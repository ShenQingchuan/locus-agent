import { describe, expect, it } from 'vitest'
import { parseMiningResults } from './miner-parser.js'

describe('parseMiningResults', () => {
  it('parses JSON array from raw text', () => {
    const text = `[{"summary":"User likes dark mode.","tags":["preference/editor/theme"],"confidence":0.9}]`
    const results = parseMiningResults(text)
    expect(results).toHaveLength(1)
    expect(results[0]!.summary).toBe('User likes dark mode.')
    expect(results[0]!.confidence).toBe(0.9)
  })

  it('parses JSON from markdown code block', () => {
    const text = '```json\n[{"summary":"User likes dark mode.","tags":["preference/editor/theme"],"confidence":0.9}]\n```'
    const results = parseMiningResults(text)
    expect(results).toHaveLength(1)
    expect(results[0]!.summary).toBe('User likes dark mode.')
  })

  it('returns empty array for invalid JSON', () => {
    const results = parseMiningResults('not json')
    expect(results).toHaveLength(0)
  })
})
