import type { CustomProviderMode, LLMProviderType } from '@univedge/locus-agent-sdk'
import { apiClient } from './client.js'

export interface SettingsConfigResponse {
  setupCompleted: boolean
  provider: LLMProviderType
  hasApiKey: boolean
  apiKeyMasked: string | null
  apiKeys: Partial<Record<LLMProviderType, string | null>>
  apiBase?: string
  model?: string
  customMode?: CustomProviderMode
  port: number
  runtime?: { provider: string, model: string, contextWindow: number }
}

export interface UpdateSettingsConfigRequest {
  provider?: LLMProviderType
  apiKey?: string
  apiBase?: string
  model?: string
  customMode?: CustomProviderMode
  port?: number
}

export async function fetchSettings(): Promise<{
  provider: string
  model: string
  contextWindow: number
} | null> {
  try {
    return await apiClient.get<{
      provider: string
      model: string
      contextWindow: number
    }>('/api/settings')
  }
  catch {
    return null
  }
}

export async function fetchSettingsConfig(): Promise<SettingsConfigResponse | null> {
  try {
    return await apiClient.get<SettingsConfigResponse>('/api/settings/config')
  }
  catch {
    return null
  }
}

export async function updateSettingsConfig(
  data: UpdateSettingsConfigRequest,
): Promise<{
  success: boolean
  message?: string
  requiresRestart?: boolean
  config?: SettingsConfigResponse
}> {
  try {
    const json = await apiClient.put<{
      success?: boolean
      message?: string
      requiresRestart?: boolean
      config?: SettingsConfigResponse
    }>('/api/settings/config', data)

    if (json.success === false) {
      return {
        success: false,
        message: json.message || '保存失败',
      }
    }

    return {
      success: true,
      requiresRestart: !!json.requiresRestart,
      config: json.config,
    }
  }
  catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
