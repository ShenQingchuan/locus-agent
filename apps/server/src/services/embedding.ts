import { embed, embedMany } from 'ai'
import { createZhipu } from 'zhipu-ai-provider'
import { getSetting } from '../settings/index.js'

/**
 * Zhipu embedding-3 — 1024 dimensions
 * Requires a Zhipu API key stored in settings DB (llm.api_key.zhipu)
 */
export const EMBEDDING_DIM = 1024

function getZhipuApiKey(): string | undefined {
  return getSetting('llm.api_key.zhipu') || undefined
}

/**
 * Whether embedding is configured (Zhipu API key available)
 */
export function isEmbeddingConfigured(): boolean {
  return !!getZhipuApiKey()
}

function createEmbeddingModel() {
  const apiKey = getZhipuApiKey()
  if (!apiKey)
    throw new Error('Zhipu API key not configured. Set it in LLM settings.')

  const zhipu = createZhipu({
    apiKey,
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  })

  return zhipu.textEmbeddingModel('embedding-3', { dimensions: EMBEDDING_DIM })
}

/**
 * Embed a single text and return the vector as Float32Array
 */
export async function embedText(text: string): Promise<Float32Array> {
  const model = createEmbeddingModel()
  const { embedding } = await embed({ model, value: text })
  return new Float32Array(embedding)
}

/**
 * Alias for embedText — used when embedding note content for storage
 */
export const embedPassage = embedText

/**
 * Alias for embedText — used when embedding search queries
 * (Zhipu embedding-3 does not require query/passage prefixes)
 */
export const embedQuery = embedText

/**
 * Batch embed multiple texts, returning Float32Array per text
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const model = createEmbeddingModel()

  const CHUNK_SIZE = 64
  const results: Float32Array[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)
    const { embeddings } = await embedMany({ model, values: chunk })
    for (const emb of embeddings) {
      results.push(new Float32Array(emb))
    }
    onProgress?.(results.length, texts.length)
  }

  return results
}
