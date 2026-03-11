import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getSetting, setSetting } from '../settings/index.js'
import { getModelsDir } from '../settings/paths.js'
import { importTransformersFromDeps, isLocalDepsInstalled } from './localDeps.js'

// ==================== Constants ====================

const MODEL_ID = 'onnx-community/Qwen3-Embedding-0.6B-ONNX'
const MODEL_DTYPE = 'q8' as const
const MODEL_SUBDIR = 'qwen3-embedding-0.6b'

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

// ==================== Pipeline singleton ====================

// Use `any` — @huggingface/transformers types vary across versions
// and pipeline options (cache_dir, progress_callback) aren't always typed
let pipelineInstance: any = null
let loadingPromise: Promise<any> | null = null

function getModelCacheDir(): string {
  return join(getModelsDir(), MODEL_SUBDIR)
}

// ==================== Status ====================

/**
 * Check if the local model has been downloaded (via settings flag)
 */
export function isLocalModelReady(): boolean {
  return getSetting('embedding.local_model.ready') === 'true'
}

/**
 * Scan model cache directory and return file info list
 */
export function getLocalModelFiles(): ModelFileInfo[] {
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
        // Skip internal HF cache metadata
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
 * Download the ONNX model from HuggingFace with per-file progress.
 * Fires progress_callback events that we relay to the frontend.
 */
export async function downloadModel(
  onProgress: (data: ModelFileProgress) => void,
): Promise<void> {
  const cacheDir = getModelCacheDir()

  const { pipeline } = await importTransformers()

  // Reset existing instance
  pipelineInstance = null
  loadingPromise = null

  const p = pipeline('feature-extraction', MODEL_ID, {
    dtype: MODEL_DTYPE,
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

  // Persist file manifest for status display
  const files = getLocalModelFiles()
  setSetting('embedding.local_model.files', JSON.stringify(files))
  setSetting('embedding.local_model.ready', 'true')
}

// ==================== Inference ====================

async function ensurePipeline(): Promise<any> {
  if (pipelineInstance)
    return pipelineInstance

  if (loadingPromise)
    return loadingPromise

  const cacheDir = getModelCacheDir()
  const { pipeline } = await importTransformers()

  loadingPromise = pipeline('feature-extraction', MODEL_ID, {
    dtype: MODEL_DTYPE,
    cache_dir: cacheDir,
    local_files_only: true,
  })

  pipelineInstance = await loadingPromise
  loadingPromise = null
  return pipelineInstance
}

/**
 * Extract last-token embedding from raw pipeline output and L2-normalize.
 * Qwen3-Embedding is decoder-only — the last token aggregates full context
 * via causal attention, unlike encoder models that use mean/CLS pooling.
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

/**
 * Embed a single text using the local ONNX model
 */
export async function embedTextLocal(text: string): Promise<Float32Array> {
  const extractor = await ensurePipeline()
  const output = await extractor(text, { pooling: 'none', normalize: false })
  return lastTokenPool(output)
}

/**
 * Batch embed using local model, processing in chunks to limit memory
 */
export async function embedBatchLocal(
  texts: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array[]> {
  const extractor = await ensurePipeline()
  const CHUNK_SIZE = 8
  const results: Float32Array[] = []

  for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
    const chunk = texts.slice(i, i + CHUNK_SIZE)

    for (const text of chunk) {
      const output = await extractor(text, { pooling: 'none', normalize: false })
      results.push(lastTokenPool(output))
    }

    onProgress?.(results.length, texts.length)
  }

  return results
}

// ==================== Cleanup ====================

/**
 * Delete downloaded model files and clear state
 */
export async function deleteLocalModel(): Promise<void> {
  pipelineInstance = null
  loadingPromise = null

  const cacheDir = getModelCacheDir()
  if (existsSync(cacheDir)) {
    await rm(cacheDir, { recursive: true })
  }

  setSetting('embedding.local_model.ready', '')
  setSetting('embedding.local_model.files', '')
}

/**
 * Reset pipeline instance (call after settings change)
 */
export function resetPipeline(): void {
  pipelineInstance = null
  loadingPromise = null
}
