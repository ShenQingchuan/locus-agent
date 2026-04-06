import type { LocalEmbeddingFamily } from './local.js'
import { embed, embedMany } from 'ai'
import { createZhipu } from 'zhipu-ai-provider'
import { getSetting, setSetting } from '../../settings/index.js'
import {
  embedBatchLocal,
  embedQueryLocal,
  embedTextLocal,
  getLocalEmbeddingFamily,
  getLocalEmbeddingModel,
  isLocalModelReady,
  setLocalEmbeddingFamily,
} from './local.js'

export const EMBEDDING_DIM = 1024

export type EmbeddingProvider = 'zhipu' | 'local'
export type EmbeddingLocalFamily = LocalEmbeddingFamily

export interface EmbeddingSelection {
  provider: EmbeddingProvider
  label: string
  modelId: string
  source: string
  dimensions: number
  localFamily: EmbeddingLocalFamily | null
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return (getSetting('embedding.provider') as EmbeddingProvider) || 'zhipu'
}

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  setSetting('embedding.provider', provider)
}

export function getLocalEmbeddingModelFamily(): EmbeddingLocalFamily {
  return getLocalEmbeddingFamily()
}

export function setLocalEmbeddingModelFamily(family: EmbeddingLocalFamily): void {
  setLocalEmbeddingFamily(family)
}

export function getActiveEmbeddingSelection(
  provider = getEmbeddingProvider(),
): EmbeddingSelection {
  if (provider === 'local') {
    const model = getLocalEmbeddingModel()
    return {
      provider,
      label: model.label,
      modelId: model.modelId,
      source: model.source,
      dimensions: model.dimensions,
      localFamily: model.family,
    }
  }

  return {
    provider,
    label: '智谱 embedding-3',
    modelId: 'embedding-3',
    source: 'https://open.bigmodel.cn/',
    dimensions: EMBEDDING_DIM,
    localFamily: null,
  }
}

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

export function isEmbeddingConfigured(): boolean {
  const provider = getEmbeddingProvider()
  if (provider === 'local')
    return isLocalModelReady()
  return !!getZhipuApiKey()
}

export async function embedText(text: string): Promise<Float32Array> {
  const provider = getEmbeddingProvider()
  if (provider === 'local')
    return embedTextLocal(text)

  const model = createEmbeddingModel()
  const { embedding } = await embed({ model, value: text })
  return new Float32Array(embedding)
}

export const embedPassage = embedText

export async function embedQuery(text: string): Promise<Float32Array> {
  const provider = getEmbeddingProvider()
  if (provider === 'local')
    return embedQueryLocal(text)

  const model = createEmbeddingModel()
  const { embedding } = await embed({ model, value: text })
  return new Float32Array(embedding)
}

export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const provider = getEmbeddingProvider()

  if (provider === 'local')
    return embedBatchLocal(texts, onProgress)

  const model = createEmbeddingModel()
  const CHUNK_SIZE = 64
  const results: Float32Array[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)
    const { embeddings } = await embedMany({ model, values: chunk })
    for (const emb of embeddings)
      results.push(new Float32Array(emb))
    onProgress?.(results.length, texts.length)
  }

  return results
}
