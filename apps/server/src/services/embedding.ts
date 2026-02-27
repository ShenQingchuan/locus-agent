import type { FeatureExtractionPipeline } from '@huggingface/transformers'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Xenova/multilingual-e5-small — Transformers.js 官方转换
 * 多语言（100+ 语言含中文），384 维，INT8 量化约 90MB
 * Pooling: mean, 需要 "query: " / "passage: " 前缀
 */
const MODEL_ID = 'Xenova/multilingual-e5-small'
export const EMBEDDING_DIM = 384

/**
 * 稳定缓存目录（避免放在 node_modules 里被 pnpm install 清除）
 */
const CACHE_DIR = join(homedir(), '.cache', 'huggingface', 'transformers-js')

/**
 * 模型 ONNX 文件在缓存中的路径
 */
function getModelCachePath(): string {
  return join(CACHE_DIR, MODEL_ID, 'onnx', 'model_quantized.onnx')
}

// ==================== Singleton ====================

let _extractor: FeatureExtractionPipeline | null = null
let _loadingPromise: Promise<FeatureExtractionPipeline> | null = null

/**
 * HuggingFace Transformers.js 下载进度回调参数
 */
export interface ModelProgress {
  status: string
  name?: string
  file?: string
  loaded?: number
  total?: number
  progress?: number
}

/**
 * 模型文件是否已缓存到磁盘（不要求已加载到内存）
 */
export function isModelCached(): boolean {
  return existsSync(getModelCachePath())
}

/**
 * 下载并加载 embedding 模型（单例，带并发保护）
 *
 * 模型缓存到 ~/.cache/huggingface/transformers-js/
 * 后续调用直接返回已加载实例
 */
export async function loadModel(
  onProgress?: (p: ModelProgress) => void,
): Promise<void> {
  if (_extractor)
    return

  if (_loadingPromise) {
    await _loadingPromise
    return
  }

  _loadingPromise = (async () => {
    // Dynamic import to avoid top-level side effects
    const { pipeline, env } = await import('@huggingface/transformers')
    // 使用稳定缓存目录
    env.cacheDir = CACHE_DIR

    const extractor = await pipeline(
      'feature-extraction',
      MODEL_ID,
      {
        dtype: 'q8',
        progress_callback: onProgress ?? undefined,
      },
    )
    return extractor as FeatureExtractionPipeline
  })()

  try {
    _extractor = await _loadingPromise
  }
  finally {
    _loadingPromise = null
  }
}

/**
 * 模型是否已加载到内存
 */
export function isModelLoaded(): boolean {
  return _extractor !== null
}

/**
 * 释放模型，回收内存
 */
export async function unloadModel(): Promise<void> {
  if (_extractor) {
    await _extractor.dispose()
    _extractor = null
  }
}

/**
 * 删除磁盘上的模型缓存文件
 */
export async function deleteModelCache(): Promise<void> {
  const modelDir = join(CACHE_DIR, MODEL_ID)
  const { rm } = await import('node:fs/promises')
  await rm(modelDir, { recursive: true, force: true })
}

/**
 * 单条文本 → 384 维归一化向量
 *
 * E5 模型要求查询文本加 "query: " 前缀，文档文本加 "passage: " 前缀
 * 此函数用于存储（passage）和查询（query）时分别传入对应文本
 */
export async function embed(text: string): Promise<Float32Array> {
  if (!_extractor)
    throw new Error('Embedding model not loaded. Call loadModel() first.')

  const output = await _extractor(text, { pooling: 'mean', normalize: true })
  return new Float32Array((output.data as Float32Array).buffer, 0, EMBEDDING_DIM)
}

/**
 * 为查询文本生成 embedding（自动加 "query: " 前缀）
 */
export async function embedQuery(text: string): Promise<Float32Array> {
  return embed(`query: ${text}`)
}

/**
 * 为文档/笔记文本生成 embedding（自动加 "passage: " 前缀）
 */
export async function embedPassage(text: string): Promise<Float32Array> {
  return embed(`passage: ${text}`)
}

/**
 * 批量文档文本 → 384 维归一化向量数组
 *
 * 逐条处理，自动加 "passage: " 前缀
 */
export async function embedBatch(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  if (!_extractor)
    throw new Error('Embedding model not loaded. Call loadModel() first.')

  const results: Float32Array[] = []
  for (let i = 0; i < texts.length; i++) {
    const output = await _extractor(`passage: ${texts[i]}`, { pooling: 'mean', normalize: true })
    results.push(new Float32Array((output.data as Float32Array).buffer, 0, EMBEDDING_DIM))
    onProgress?.(i + 1, texts.length)
  }
  return results
}
