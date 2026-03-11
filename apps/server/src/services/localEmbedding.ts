import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getSetting, setSetting } from '../settings/index.js'
import { getModelsDir } from '../settings/paths.js'
import { importTransformersFromDeps, isLocalDepsInstalled } from './localDeps.js'

// ==================== Constants ====================

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

// ==================== Types ====================

export interface ModelFileProgress {
  file: string
  status: 'initiate' | 'download' | 'progress' | 'done'
  progress?: number // 0-100
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

// ==================== Dependency check ====================

const MISSING_DEPS_MSG
  = '本地 embedding 运行时未安装，请先在设置中安装 ONNX 运行时'

async function importTransformers() {
  try {
    return await importTransformersFromDeps()
  }
  catch {
    throw new Error(MISSING_DEPS_MSG)
  }
}

/**
 * Check if @huggingface/transformers is installed (non-throwing)
 */
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

// ==================== Settings ====================

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

// ==================== Pipeline singleton ====================

// Use `any` - @huggingface/transformers types vary across versions
// and pipeline options (cache_dir, progress_callback) are not always typed
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

// ==================== Status ====================

/**
 * Check if the active local model has been downloaded
 */
export function isLocalModelReady(): boolean {
  const family = getLocalEmbeddingFamily()
  if (getSetting(getModelReadyKey(family)) === 'true')
    return true

  if (migrateLegacyQwenModelState())
    return true

  return hasModelFiles(getModelCacheDir(family))
}

/**
 * Scan model cache directory and return file info list
 */
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

// ==================== Download ====================

/**
 * Download the active ONNX model from HuggingFace with per-file progress.
 */
export async function downloadModel(
  onProgress: (data: ModelFileProgress) => void,
): Promise<void> {
  const family = getLocalEmbeddingFamily()
  const config = getModelConfig(family)
  const cacheDir = getModelCacheDir(family)
  const { pipeline } = await importTransformers()

  pipelineInstance = null
  loadingPromise = null

  const p = pipeline('feature-extraction', config.modelId, {
    ...(config.dtype ? { dtype: config.dtype } : {}),
    cache_dir: cacheDir,
    progress_callback: (event: any) => {
      if (event.file) {
        onProgress({
          file: event.file,
          status: event.status,
          progress: event.progress,
          loaded: event.loaded,
          total: event.total,
        })
      }
    },
  })

  pipelineInstance = await p

  const files = getLocalModelFiles()
  setSetting(getModelFilesKey(family), JSON.stringify(files))
  setSetting(getModelReadyKey(family), 'true')
}

// ==================== Inference ====================

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

/**
 * Extract last-token embedding from raw pipeline output and L2-normalize.
 * Qwen3-Embedding is decoder-only - the last token aggregates full context.
 */
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

/**
 * Embed a single text using the active local ONNX model.
 */
export async function embedTextLocal(text: string): Promise<Float32Array> {
  return embedOne(text, 'passage')
}

/**
 * Embed a search query using the active local ONNX model.
 */
export async function embedQueryLocal(text: string): Promise<Float32Array> {
  return embedOne(text, 'query')
}

/**
 * Batch embed using local model, processing in chunks to limit memory.
 */
export async function embedBatchLocal(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const CHUNK_SIZE = 8
  const results: Float32Array[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)

    for (const text of chunk)
      results.push(await embedOne(text, 'passage'))

    onProgress?.(results.length, texts.length)
  }

  return results
}

// ==================== Cleanup ====================

/**
 * Delete downloaded model files and clear state for the active family.
 */
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

/**
 * Reset pipeline instance (call after settings change)
 */
export function resetPipeline(): void {
  pipelineInstance = null
  loadingPromise = null
}
