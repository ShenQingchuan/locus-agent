import { Buffer } from 'node:buffer'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'

/** Same shape as ModelFileProgress in localEmbedding (avoid circular imports). */
export interface HfFileProgress {
  file: string
  status: 'initiate' | 'download' | 'progress' | 'done'
  progress?: number
  loaded?: number
  total?: number
}

/** Same layout as @huggingface/transformers FileCache (see hub.js buildResourcePaths). */
export function cacheFilePathForRepoFile(
  cacheDir: string,
  modelId: string,
  pathInRepo: string,
): string {
  return join(cacheDir, ...modelId.split('/'), ...pathInRepo.split('/'))
}

function hfResolveFileUrl(modelId: string, pathInRepo: string, revision: string): string {
  const enc = (s: string) => encodeURIComponent(s)
  const rev = enc(revision)
  const tail = pathInRepo.split('/').map(enc).join('/')
  return `https://huggingface.co/${modelId}/resolve/${rev}/${tail}`
}

function hfFetchHeaders(): Headers {
  const headers = new Headers()
  headers.set('User-Agent', 'locus-agent/embedding; transformers.js compatible')
  const token = process.env.HF_TOKEN ?? process.env.HF_ACCESS_TOKEN
  if (token)
    headers.set('Authorization', `Bearer ${token}`)
  return headers
}

interface ListFilesOptions {
  family: 'qwen' | 'bge'
  dtype?: 'q8' | 'fp16' | 'fp32'
}

/**
 * Paths relative to repo root; must match what pipeline() loads for the given model/dtype.
 */
export function listHfEmbeddingRepoFiles(options: ListFilesOptions): string[] {
  const baseTokenizer = ['config.json', 'tokenizer.json', 'tokenizer_config.json']

  if (options.family === 'qwen') {
    const d = options.dtype ?? 'q8'
    if (d === 'q8')
      return [...baseTokenizer, 'onnx/model_quantized.onnx']
    if (d === 'fp16') {
      return [
        ...baseTokenizer,
        'onnx/model_fp16.onnx',
        'onnx/model_fp16.onnx_data',
      ]
    }
    return [
      ...baseTokenizer,
      'onnx/model.onnx',
      'onnx/model.onnx_data',
    ]
  }

  // BGE-M3 (Node defaults to cpu → fp32 weights)
  return [
    ...baseTokenizer,
    'special_tokens_map.json',
    'sentencepiece.bpe.model',
    'onnx/model.onnx',
    'onnx/model.onnx_data',
  ]
}

async function downloadOneFile(
  url: string,
  destPath: string,
  fileLabel: string,
  onProgress: (data: HfFileProgress) => void,
): Promise<void> {
  await mkdir(dirname(destPath), { recursive: true })

  const res = await fetch(url, { headers: hfFetchHeaders() })
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} while fetching ${fileLabel} (${url})`,
    )
  }

  const body = res.body
  if (!body)
    throw new Error(`No response body for ${fileLabel}`)

  const total = res.headers.get('content-length')
    ? Number.parseInt(res.headers.get('content-length')!, 10)
    : undefined

  onProgress({
    file: fileLabel,
    status: 'download',
  })

  const reader = body.getReader()
  const fileStream = createWriteStream(destPath)
  let loaded = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (!value?.length)
        continue
      loaded += value.length
      await new Promise<void>((resolve, reject) => {
        fileStream.write(Buffer.from(value), (err) => {
          if (err)
            reject(err)
          else
            resolve()
        })
      })
      const pct = total && total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : undefined
      onProgress({
        file: fileLabel,
        status: 'progress',
        progress: pct,
        loaded,
        total,
      })
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err: unknown) => {
        if (err)
          reject(err)
        else
          resolve()
      })
    })
  }
  catch (err) {
    fileStream.destroy()
    throw err
  }

  onProgress({
    file: fileLabel,
    status: 'done',
  })
}

export interface DownloadHfRepoFilesOptions {
  modelId: string
  cacheDir: string
  files: string[]
  revision?: string
  onProgress: (data: HfFileProgress) => void
}

/**
 * Writes files under cacheDir so @huggingface/transformers FileCache can find them
 * (same paths as remote download + cache put).
 */
export async function downloadHfRepoFilesToCache(options: DownloadHfRepoFilesOptions): Promise<void> {
  const { modelId, cacheDir, files, revision = 'main', onProgress } = options

  for (const pathInRepo of files) {
    onProgress({
      file: pathInRepo,
      status: 'initiate',
    })

    const url = hfResolveFileUrl(modelId, pathInRepo, revision)
    const dest = cacheFilePathForRepoFile(cacheDir, modelId, pathInRepo)
    await downloadOneFile(url, dest, pathInRepo, onProgress)
  }
}
