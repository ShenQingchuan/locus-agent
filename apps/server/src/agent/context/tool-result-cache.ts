import type { CacheEntry, ResultCacheStorage } from '@univedge/locus-agent-sdk'
import type { ModelMessage } from 'ai'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compactToolResults as compactToolResultsCore } from '@univedge/locus-agent-sdk'
import { getDataDir } from '../../settings/paths.js'

const CACHE_SUBDIR = 'tmp/tools-result'

function getCacheDir(): string {
  const dir = join(getDataDir(), CACHE_SUBDIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * File-system backed storage for tool result caching.
 */
function createFsStorage(): ResultCacheStorage {
  const cacheDir = getCacheDir()
  return {
    write(key: string, content: string) {
      writeFileSync(join(cacheDir, key), content, 'utf-8')
    },
    read(key: string) {
      const path = join(cacheDir, key)
      if (!existsSync(path))
        return null
      return readFileSync(path, 'utf-8')
    },
  }
}

/**
 * Cold/hot split for tool results using the file-system backend.
 * Delegates to the SDK's core implementation with FS storage.
 */
export function compactToolResults(
  messages: ModelMessage[],
  hotTailCount?: number,
  minSizeToCache?: number,
): CacheEntry[] {
  return compactToolResultsCore(messages, {
    hotTailCount,
    minSizeToCache,
    storage: createFsStorage(),
  })
}
