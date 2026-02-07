import { Hono } from 'hono'
import { getCurrentModelInfo } from '../agent/providers/index.js'

export const settingsRoutes = new Hono()

/**
 * GET /api/settings - Get current LLM settings including model context window
 */
settingsRoutes.get('/', (c) => {
  try {
    const modelInfo = getCurrentModelInfo()
    return c.json({
      provider: modelInfo.provider,
      model: modelInfo.model,
      contextWindow: modelInfo.contextWindow,
    })
  }
  catch (error) {
    return c.json(
      {
        error: 'Failed to get settings',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
})
