import { createHash } from 'node:crypto'

class SimpleLRUCache<K, V> {
  private map = new Map<K, { value: V, expiresAt: number }>()
  constructor(private max: number, private ttl: number) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key)
    if (!entry)
      return undefined
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }
    // Move to end (most recently used)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.max && !this.map.has(key)) {
      const firstKey = this.map.keys().next().value
      if (firstKey !== undefined)
        this.map.delete(firstKey)
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttl })
  }
}

const cache = new SimpleLRUCache<string, Float32Array>(500, 1000 * 60 * 60)

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function getCachedEmbedding(text: string): Float32Array | undefined {
  return cache.get(hashText(text))
}

export function setCachedEmbedding(text: string, embedding: Float32Array): void {
  cache.set(hashText(text), embedding)
}
