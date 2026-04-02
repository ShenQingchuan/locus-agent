/**
 * File State LRU Cache (Node.js only)
 *
 * Bounded cache for file contents with path normalization.
 * Used to track file states for compaction diffs and avoiding
 * redundant reads during an agent session.
 */

import { normalize, resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileState {
  content: string
  timestamp: number
  offset?: number
  limit?: number
  isPartialView?: boolean
}

// ---------------------------------------------------------------------------
// FileStateCache
// ---------------------------------------------------------------------------

/**
 * LRU file state cache with entry count and byte-size limits.
 */
export class FileStateCache {
  private readonly cache = new Map<string, FileState>()
  private readonly maxEntries: number
  private readonly maxSizeBytes: number
  private currentSizeBytes = 0

  constructor(maxEntries = 100, maxSizeBytes = 25 * 1024 * 1024) {
    this.maxEntries = maxEntries
    this.maxSizeBytes = maxSizeBytes
  }

  private normalizePath(filePath: string): string {
    return normalize(resolve(filePath))
  }

  private byteLength(content: string): number {
    // Use TextEncoder when available (browser-compat), fall back to Buffer
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(content).length
    }
    return Buffer.byteLength(content, 'utf-8')
  }

  get(filePath: string): FileState | undefined {
    const key = this.normalizePath(filePath)
    const entry = this.cache.get(key)
    if (entry) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, entry)
    }
    return entry
  }

  set(filePath: string, state: FileState): void {
    const key = this.normalizePath(filePath)
    const old = this.cache.get(key)
    if (old) {
      this.currentSizeBytes -= this.byteLength(old.content)
      this.cache.delete(key)
    }

    const newSize = this.byteLength(state.content)

    // Evict LRU entries until within limits
    while (
      this.cache.size > 0
      && (this.cache.size >= this.maxEntries || this.currentSizeBytes + newSize > this.maxSizeBytes)
    ) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        const entry = this.cache.get(firstKey)
        if (entry)
          this.currentSizeBytes -= this.byteLength(entry.content)
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, state)
    this.currentSizeBytes += newSize
  }

  delete(filePath: string): boolean {
    const key = this.normalizePath(filePath)
    const entry = this.cache.get(key)
    if (entry) {
      this.currentSizeBytes -= this.byteLength(entry.content)
      this.cache.delete(key)
      return true
    }
    return false
  }

  clear(): void {
    this.cache.clear()
    this.currentSizeBytes = 0
  }

  get size(): number {
    return this.cache.size
  }

  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  clone(): FileStateCache {
    const copy = new FileStateCache(this.maxEntries, this.maxSizeBytes)
    for (const [key, value] of this.cache) {
      copy.cache.set(key, { ...value })
    }
    copy.currentSizeBytes = this.currentSizeBytes
    return copy
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createFileStateCache(
  maxEntries = 100,
  maxSizeBytes = 25 * 1024 * 1024,
): FileStateCache {
  return new FileStateCache(maxEntries, maxSizeBytes)
}
