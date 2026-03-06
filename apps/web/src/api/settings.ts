import type { CustomProviderMode, LLMProviderType } from '@locus-agent/shared'

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
  // Coding providers
  codingKimi?: {
    hasApiKey: boolean
    apiKeyMasked: string | null
    apiBase: string
    model: string
  }
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
    const response = await fetch(`/api/settings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch settings:', response.statusText)
      return null
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch settings:', error)
    return null
  }
}

export async function fetchSettingsConfig(): Promise<SettingsConfigResponse | null> {
  try {
    const response = await fetch(`/api/settings/config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch settings config:', response.statusText)
      return null
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to fetch settings config:', error)
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
    const response = await fetch(`/api/settings/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    const json = await response.json().catch(() => null) as any

    if (!response.ok) {
      const msg = json?.message || response.statusText || 'Request failed'
      const friendly = response.status >= 500 ? '服务器内部错误，请稍后重试' : msg
      return {
        success: false,
        message: friendly,
      }
    }

    if (json?.success === false) {
      return {
        success: false,
        message: json?.message || '保存失败',
      }
    }

    return {
      success: true,
      requiresRestart: !!json?.requiresRestart,
      config: json?.config as SettingsConfigResponse | undefined,
    }
  }
  catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ---------------------------------------------------------------------------
// Coding provider APIs
// ---------------------------------------------------------------------------

export async function updateKimiCodeSettings(data: {
  apiKey?: string
  apiBase?: string
  model?: string
}): Promise<{ success: boolean, message?: string, config?: SettingsConfigResponse }> {
  try {
    const res = await fetch('/api/settings/coding/kimi', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json().catch(() => null) as any
    if (!res.ok || json?.success === false) {
      return { success: false, message: json?.message || 'Failed to save Kimi Code settings' }
    }
    return { success: true, config: json?.config }
  }
  catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
  }
}
