import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { importTransformersFromDeps, isLocalDepsInstalled } from '../../services/localDeps.js'
import { getSetting, setSetting } from '../../settings/index.js'
import { getModelsDir } from '../../settings/paths.js'

export type LocalEmbeddingFamily = 'qwen' | 'bge'

interface LocalEmbeddingModelConfig {
  family: LocalEmbeddingFamily
  label: string
  modelId: string
  source: string
  cacheSubdir: string
  dimensions: number
  downloadSize: string
  inference: 'qwen-last-token' | 'bge-cls'
  dtype?: 'q8' | 'fp16' | 'fp32'
}

export const LOCAL_EMBEDDING_MODELS: Record<LocalEmbeddingFamily, LocalEmbeddingModelConfig> = {
  qwen: {
    family: 'qwen',
    label: 'Qwen3-Embedding-0.6B',
    modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
    source: 'https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX',
    cacheSubdir: 'qwen3-embedding-0.6b',
    dimensions: 1024,
    downloadSize: '~700 MB',
    inference: 'qwen-last-token',
    dtype: 'q8',
  },
  bge: {
    family: 'bge',
    label: 'BGE-M3',
    modelId: 'Xenova/bge-m3',
    source: 'https://huggingface.co/Xenova/bge-m3',
    cacheSubdir: 'bge-m3',
    dimensions: 1024,
    downloadSize: '~2 GB',
    inference: 'bge-cls',
  },
}

const KEY_LOCAL_FAMILY = 'embedding.local_family'
const LEGACY_LOCAL_MODEL_READY_KEY = 'embedding.local_model.ready'
const LEGACY_LOCAL_MODEL_FILES_KEY = 'embedding.local_model.files'
const QUERY_INSTRUCTION = 'Instruct: Given a search query, retrieve relevant notes that match the query\nQuery: '

export interface ModelFileProgress {
  file: string
  status: 'initiate' | 'download' | 'progress' | 'done'
  progress?: number
  loaded?: number
  total?: number
}

export interface ModelFileInfo {
  name: string
  size: number
}

export interface ActiveLocalEmbeddingModel {
  family: LocalEmbeddingFamily
  label: string
  modelId: string
  source: string
  dimensions: number
  downloadSize: string
}

const MISSING_DEPS_MSG = '本地 embedding 运行时未安装，请先在设置中安装 ONNX 运行时'

async function importTransformers() {
  try {
    return await importTransformersFromDeps()
  }
  catch {
    throw new Error(MISSING_DEPS_MSG)
  }
}

export async function isTransformersAvailable(): Promise<boolean> {
  if (!isLocalDepsInstalled())
    return false
  try {
    await importTransformersFromDeps()
    return true
  }
  catch {
    return false
  }
}

function getModelReadyKey(family: LocalEmbeddingFamily): string {
  return `embedding.local_model.${family}.ready`
}

function getModelFilesKey(family: LocalEmbeddingFamily): string {
  return `embedding.local_model.${family}.files`
}

export function getLocalEmbeddingFamily(): LocalEmbeddingFamily {
  const family = getSetting(KEY_LOCAL_FAMILY)
  return family === 'bge' ? 'bge' : 'qwen'
}

export function setLocalEmbeddingFamily(family: LocalEmbeddingFamily): void {
  setSetting(KEY_LOCAL_FAMILY, family)
}

function getModelConfig(family = getLocalEmbeddingFamily()): LocalEmbeddingModelConfig {
  return LOCAL_EMBEDDING_MODELS[family]
}

export function getLocalEmbeddingModel(family = getLocalEmbeddingFamily()): ActiveLocalEmbeddingModel {
  const config = getModelConfig(family)
  return {
    family: config.family,
    label: config.label,
    modelId: config.modelId,
    source: config.source,
    dimensions: config.dimensions,
    downloadSize: config.downloadSize,
  }
}

let pipelineInstance: any = null
let loadingPromise: Promise<any> | null = null

function getModelCacheDir(family = getLocalEmbeddingFamily()): string {
  return join(getModelsDir(), getModelConfig(family).cacheSubdir)
}

function hasModelFiles(cacheDir: string): boolean {
  if (!existsSync(cacheDir))
    return false
  const files: ModelFileInfo[] = []
  scanDir(cacheDir, cacheDir, files)
  return files.length > 0
}

function migrateLegacyQwenModelState(): boolean {
  const family = getLocalEmbeddingFamily()
  if (family !== 'qwen')
    return false

  const readyKey = getModelReadyKey('qwen')
  if (getSetting(readyKey) === 'true')
    return true

  const cacheDir = getModelCacheDir('qwen')
  const legacyReady = getSetting(LEGACY_LOCAL_MODEL_READY_KEY) === 'true'
  const hasFiles = hasModelFiles(cacheDir)
  if (!legacyReady && !hasFiles)
    return false

  setSetting(readyKey, 'true')
  const legacyFiles = getSetting(LEGACY_LOCAL_MODEL_FILES_KEY)
  if (legacyFiles)
    setSetting(getModelFilesKey('qwen'), legacyFiles)

  return true
}

export function isLocalModelReady(): boolean {
  const family = getLocalEmbeddingFamily()
  if (getSetting(getModelReadyKey(family)) === 'true')
    return true

  if (migrateLegacyQwenModelState())
    return true

  return hasModelFiles(getModelCacheDir(family))
}

export function getLocalModelFiles(): ModelFileInfo[] {
  migrateLegacyQwenModelState()
  const cacheDir = getModelCacheDir()
  if (!existsSync(cacheDir))
    return []
  const files: ModelFileInfo[] = []
  scanDir(cacheDir, cacheDir, files)
  return files
}

function scanDir(baseDir: string, dir: string, out: ModelFileInfo[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  }
  catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    try {
      const stat = statSync(fullPath)
      if (stat.isDirectory()) {
        scanDir(baseDir, fullPath, out)
      }
      else if (stat.isFile()) {
        const relativePath = fullPath.slice(baseDir.length + 1)
        if (relativePath.startsWith('blobs') || relativePath.startsWith('refs'))
          continue
        out.push({ name: relativePath, size: stat.size })
      }
    }
    catch {
      // skip inaccessible entries
    }
  }
}

export { downloadModel } from '../../services/localEmbedding.js'

async function ensurePipeline(): Promise<any> {
  if (pipelineInstance)
    return pipelineInstance

  if (loadingPromise)
    return loadingPromise

  const config = getModelConfig()
  const cacheDir = getModelCacheDir()
  const { pipeline } = await importTransformers()

  loadingPromise = pipeline('feature-extraction', config.modelId, {
    ...(config.dtype ? { dtype: config.dtype } : {}),
    cache_dir: cacheDir,
    local_files_only: true,
  })

  pipelineInstance = await loadingPromise
  loadingPromise = null
  return pipelineInstance
}

function lastTokenPool(output: { data: Float32Array | Float64Array, dims: number[] }): Float32Array {
  const [, seqLen, hiddenDim] = output.dims
  const offset = (seqLen - 1) * hiddenDim
  const embedding = new Float32Array(hiddenDim)

  for (let i = 0; i < hiddenDim; i++)
    embedding[i] = output.data[offset + i]

  let norm = 0
  for (let i = 0; i < hiddenDim; i++)
    norm += embedding[i] * embedding[i]
  norm = Math.sqrt(norm)

  for (let i = 0; i < hiddenDim; i++)
    embedding[i] /= norm

  return embedding
}

function tensorToFloat32Array(output: { data: Float32Array | Float64Array }): Float32Array {
  return output.data instanceof Float32Array
    ? output.data
    : new Float32Array(output.data)
}

async function embedOne(text: string, mode: 'query' | 'passage'): Promise<Float32Array> {
  const extractor = await ensurePipeline()
  const config = getModelConfig()

  if (config.inference === 'qwen-last-token') {
    const value = mode === 'query' ? `${QUERY_INSTRUCTION}${text}` : text
    const output = await extractor(value, { pooling: 'none', normalize: false })
    return lastTokenPool(output)
  }

  const output = await extractor(text, { pooling: 'cls', normalize: true })
  return tensorToFloat32Array(output)
}

export async function embedTextLocal(text: string): Promise<Float32Array> {
  return embedOne(text, 'passage')
}

export async function embedQueryLocal(text: string): Promise<Float32Array> {
  return embedOne(text, 'query')
}

export async function embedBatchLocal(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const extractor = await ensurePipeline()
  const config = getModelConfig()

  const CHUNK_SIZE = 8
  const results: Float32Array[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)

    // True batch inference for the chunk
    const outputs = await extractor(chunk, {
      pooling: config.inference === 'qwen-last-token' ? 'none' : 'cls',
      normalize: config.inference !== 'qwen-last-token',
    })

    // @huggingface/transformers returns a nested array when batching:
    // data: Float32Array of shape [batch, seqLen, hiddenDim] for 'none'
    // or [batch, hiddenDim] for 'cls'
    const isQwen = config.inference === 'qwen-last-token'
    const batchSize = chunk.length
    const hiddenDim = isQwen ? outputs.dims[2] : outputs.dims[1]

    for (let b = 0; b < batchSize; b++) {
      if (isQwen) {
        const seqLen = outputs.dims[1]
        const offset = b * seqLen * hiddenDim + (seqLen - 1) * hiddenDim
        const embedding = new Float32Array(hiddenDim)
        for (let d = 0; d < hiddenDim; d++)
          embedding[d] = outputs.data[offset + d]
        // L2 normalize
        let norm = 0
        for (let d = 0; d < hiddenDim; d++)
          norm += embedding[d] * embedding[d]
        norm = Math.sqrt(norm)
        for (let d = 0; d < hiddenDim; d++)
          embedding[d] /= norm
        results.push(embedding)
      }
      else {
        const offset = b * hiddenDim
        results.push(new Float32Array(outputs.data.buffer, (outputs.data.byteOffset + offset * 4), hiddenDim))
      }
    }

    onProgress?.(results.length, texts.length)
  }

  return results
}

export async function deleteLocalModel(): Promise<void> {
  const family = getLocalEmbeddingFamily()

  pipelineInstance = null
  loadingPromise = null

  const cacheDir = getModelCacheDir(family)
  if (existsSync(cacheDir))
    await rm(cacheDir, { recursive: true })

  setSetting(getModelReadyKey(family), '')
  setSetting(getModelFilesKey(family), '')

  if (family === 'qwen') {
    setSetting(LEGACY_LOCAL_MODEL_READY_KEY, '')
    setSetting(LEGACY_LOCAL_MODEL_FILES_KEY, '')
  }
}

export function resetPipeline(): void {
  pipelineInstance = null
  loadingPromise = null
}
