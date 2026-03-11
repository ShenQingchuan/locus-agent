import { embed, embedMany } from 'ai'
import { createZhipu } from 'zhipu-ai-provider'
import { getSetting, setSetting } from '../settings/index.js'
import {
  embedBatchLocal,
  embedTextLocal,
  isLocalModelReady,
} from './localEmbedding.js'

// ==================== Constants ====================

/**
 * Both Zhipu embedding-3 and Qwen3-Embedding-0.6B output 1024 dimensions
 */
export const EMBEDDING_DIM = 1024

export type EmbeddingProvider = 'zhipu' | 'local'

// ==================== Provider settings ====================

export function getEmbeddingProvider(): EmbeddingProvider {
  return (getSetting('embedding.provider') as EmbeddingProvider) || 'zhipu'
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  setSetting('embedding.provider', provider)
}

// ==================== Zhipu ====================

function getZhipuApiKey(): string | undefined {
  return getSetting('llm.api_key.zhipu') || undefined
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

// ==================== Unified API ====================

/**
 * Whether the currently-selected embedding provider is ready to use
 */
export function isEmbeddingConfigured(): boolean {
  const provider = getEmbeddingProvider()
  if (provider === 'local')
    return isLocalModelReady()
  return !!getZhipuApiKey()
}

/**
 * Embed a single text using the active provider
 */
export async function embedText(text: string): Promise<Float32Array> {
  const provider = getEmbeddingProvider()

  if (provider === 'local')
    return embedTextLocal(text)

  const model = createEmbeddingModel()
  const { embedding } = await embed({ model, value: text })
  return new Float32Array(embedding)
}

/** Embed document/passage text (no instruction prefix) */
export const embedPassage = embedText

/**
 * Instruction prefix for Qwen3-Embedding query-side.
 * With last-token pooling the instruction tokens influence the final
 * representation via causal attention without polluting a mean average.
 */
const QUERY_INSTRUCTION = 'Instruct: Given a search query, retrieve relevant notes that match the query\nQuery: '

/**
 * Embed a search query — adds a task instruction for the local
 * Qwen3-Embedding model to improve retrieval discrimination.
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  const provider = getEmbeddingProvider()

  if (provider === 'local')
    return embedTextLocal(`${QUERY_INSTRUCTION}${text}`)

  const model = createEmbeddingModel()
  const { embedding } = await embed({ model, value: text })
  return new Float32Array(embedding)
}

/**
 * Batch embed texts using the active provider
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const provider = getEmbeddingProvider()

  if (provider === 'local')
    return embedBatchLocal(texts, onProgress)

  // Zhipu API path
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
