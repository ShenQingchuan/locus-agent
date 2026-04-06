import { getActiveEmbeddingSelection } from './provider.js'

export interface ThresholdConfig {
  /** 该模型的最佳结果必须 <= floor，否则全部丢弃 */
  floor: number
  /** 无论 relative 怎么算，不能超过 ceiling */
  ceiling: number
  /** relative threshold = bestDist * factor */
  factor: number
  /** 即使 bestDist > floor，也至少保留 topN 个结果（除非它们 > ceiling） */
  minResults: number
}

const THRESHOLDS: Record<string, ThresholdConfig> = {
  'zhipu:embedding-3': { floor: 0.45, ceiling: 0.55, factor: 1.20, minResults: 3 },
  'local:qwen': { floor: 0.50, ceiling: 0.60, factor: 1.25, minResults: 3 },
  'local:bge': { floor: 0.40, ceiling: 0.55, factor: 1.20, minResults: 3 },
}

export function getThresholdConfig(): ThresholdConfig {
  const selection = getActiveEmbeddingSelection()
  const key = selection.provider === 'local'
    ? `local:${selection.localFamily ?? 'qwen'}`
    : `${selection.provider}:${selection.modelId}`
  return THRESHOLDS[key] ?? THRESHOLDS['local:qwen']
}

/**
 * Apply model-aware adaptive thresholding to vector search results.
 *
 * Logic:
 * 1. If bestDist <= floor: use min(bestDist * factor, ceiling) as adaptive threshold.
 * 2. If floor < bestDist <= ceiling: keep minResults (unless they exceed ceiling).
 * 3. If bestDist > ceiling: discard all.
 */
export function applyThreshold(
  results: { noteId: string, distance: number }[],
  config: ThresholdConfig = getThresholdConfig(),
): { noteId: string, distance: number }[] {
  if (results.length === 0)
    return []

  const bestDist = results[0].distance

  if (bestDist > config.ceiling)
    return []

  if (bestDist <= config.floor) {
    const adaptive = Math.min(bestDist * config.factor, config.ceiling)
    return results.filter(r => r.distance <= adaptive)
  }

  // floor < bestDist <= ceiling: keep minResults, but still cap at ceiling
  const capped = results.filter(r => r.distance <= config.ceiling)
  return capped.slice(0, Math.max(config.minResults, 1))
}
