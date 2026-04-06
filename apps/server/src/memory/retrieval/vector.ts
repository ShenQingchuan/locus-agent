import consola from 'consola'
import { embedQuery, isEmbeddingConfigured } from '../embedding/provider.js'
import { applyThreshold } from '../embedding/thresholds.js'
import { isVecAvailable, searchByVector } from '../store/vectorDb.js'

export async function searchMemoriesByVector(
  query: string,
  limit = 30,
): Promise<{ noteId: string, distance: number }[]> {
  if (!isEmbeddingConfigured() || !isVecAvailable())
    return []

  try {
    const queryVector = await embedQuery(query)
    const vecResults = searchByVector(queryVector, limit)
    const filtered = applyThreshold(vecResults)

    consola.debug(`[search] vec query="${query}" hits=${filtered.length}/${vecResults.length}`)
    return filtered
  }
  catch (err) {
    console.warn('[search] Vector search failed:', err)
    return []
  }
}
