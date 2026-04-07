import type { NoteWithTags } from '../core/types.js'
import { describe, expect, it } from 'vitest'
import { applyTimeDecay, reciprocalRankFusion } from './ranking-core.js'

describe('reciprocalRankFusion', () => {
  it('fuses vector and keyword results', () => {
    const vec = [{ noteId: 'a', distance: 0.1 }, { noteId: 'b', distance: 0.2 }]
    const kw = [{ noteId: 'b' }, { noteId: 'c' }]
    const scores = reciprocalRankFusion(vec, kw)
    expect(scores.get('a')).toBeCloseTo(1 / 61)
    expect(scores.get('b')).toBeCloseTo(1 / 61 + 1 / 62)
    expect(scores.get('c')).toBeCloseTo(1 / 62)
  })
})

describe('applyTimeDecay', () => {
  it('boosts newer memories', () => {
    const now = new Date()
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const results = [
      { note: { id: 'new', content: 'x', tags: [], createdAt: now, updatedAt: now, folderId: null, workspacePath: null, pinned: false, editorState: null, summary: null } as unknown as NoteWithTags, score: 1 },
      { note: { id: 'old', content: 'y', tags: [], createdAt: old, updatedAt: old, folderId: null, workspacePath: null, pinned: false, editorState: null, summary: null } as unknown as NoteWithTags, score: 1 },
    ]
    const decayed = applyTimeDecay(results)
    expect(decayed[0]!.score).toBeGreaterThan(decayed[1]!.score)
  })
})
