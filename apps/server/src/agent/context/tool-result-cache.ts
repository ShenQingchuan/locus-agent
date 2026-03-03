import type { ModelMessage } from 'ai'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from '../../settings/paths.js'

const CACHE_SUBDIR = 'tmp/tools-result'

/** 低于此字符数的工具结果永远不会被缓存（保持 inline） */
const MIN_SIZE_TO_CACHE = 2000

/** 最近 N 次 tool result 保持完整 inline（hot tail） */
const DEFAULT_HOT_TAIL_COUNT = 3

/** 已缓存的标记前缀 */
const CACHED_MARKER = '[CACHED:'

interface CacheEntry {
  toolCallId: string
  toolName: string
  cachePath: string
}

function getCacheDir(): string {
  const dir = join(getDataDir(), CACHE_SUBDIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 对 messages 数组中的旧 tool result 进行冷热分离。
 *
 * - hot tail（最近 hotTailCount 个 tool message）保持完整 inline
 * - 更早的 tool result 如果超过 minSizeToCache 字符，存到磁盘并替换为引用
 *
 * 直接修改 messages 数组（in-place mutation）。
 */
export function compactToolResults(
  messages: ModelMessage[],
  hotTailCount: number = DEFAULT_HOT_TAIL_COUNT,
  minSizeToCache: number = MIN_SIZE_TO_CACHE,
): CacheEntry[] {
  // 1. 收集所有 tool message 的索引
  const toolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') {
      toolIndices.push(i)
    }
  }

  // 2. 只处理 hot tail 之外的 cold 区域
  const coldCount = Math.max(0, toolIndices.length - hotTailCount)
  if (coldCount === 0) return []

  const coldIndices = toolIndices.slice(0, coldCount)
  const entries: CacheEntry[] = []
  const cacheDir = getCacheDir()

  for (const idx of coldIndices) {
    const msg = messages[idx] as any
    const content = msg.content
    if (!content || !Array.isArray(content)) continue

    for (const part of content) {
      if (part.type !== 'tool-result') continue

      const value = part.output?.value
      if (!value || typeof value !== 'string') continue
      if (value.length <= minSizeToCache) continue
      // 已缓存的跳过
      if (value.startsWith(CACHED_MARKER)) continue

      // 写入磁盘
      const filename = `${part.toolCallId}.txt`
      const cachePath = join(cacheDir, filename)
      writeFileSync(cachePath, value, 'utf-8')

      // 替换为引用 + 预览
      const preview = value.slice(0, 200).replace(/\n/g, ' ')
      part.output.value = `${CACHED_MARKER} ${cachePath}]\nPreview: ${preview}...\n(Full output: ${value.length} chars, cached to disk)`

      entries.push({
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        cachePath,
      })
    }
  }

  return entries
}
