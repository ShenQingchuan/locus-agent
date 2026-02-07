import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { setLLMConfig } from './agent/providers/index.js'
import { setServerConfig } from './config.js'
import { chatRoutes } from './routes/chat.js'
import { conversationsRoutes } from './routes/conversations.js'
import {
  closeSettingsDb,
  ensureDataDir,
  getLLMSettings,
  getServerPort,
  getSettingsDbPath,
  isYoloMode,
  openSettingsDb,
} from './settings/index.js'

/**
 * Create Hono app instance (does not start the server).
 * Shared factory for both CLI and dev mode.
 */
export function createApp(): Hono {
  const app = new Hono()

  // Middleware
  app.use('*', logger())
  app.use(
    '*',
    cors({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  )

  // Health check
  app.get('/health', c => c.json({ status: 'ok' }))

  // Routes
  app.route('/api/chat', chatRoutes)
  app.route('/api/conversations', conversationsRoutes)

  return app
}

// Dev mode: start server only when this file is the entry point (bun --watch src/index.ts)
// Bun launches HTTP server from the entry file's default export
function startDev() {
  // 1. Load config from settings DB (~/.local/share/locus-agent/locus.db)
  ensureDataDir()
  openSettingsDb(getSettingsDbPath())

  const llmSettings = getLLMSettings()
  if (!llmSettings) {
    throw new Error('LLM settings not configured. Run `locus-agent config` to set up.')
  }
  const port = getServerPort()
  const yoloMode = isYoloMode()
  closeSettingsDb()

  // 2. Inject configs (same as CLI mode)
  setLLMConfig(llmSettings)
  setServerConfig({ confirmMode: !yoloMode, port })

  // 3. Create app
  const app = createApp()

  // 4. Dev proxy: forward non-API requests to Vite dev server for HMR support
  const VITE_DEV_ORIGIN = 'http://localhost:5173'
  app.all('*', async (c) => {
    const url = new URL(c.req.url)
    url.host = 'localhost'
    url.port = '5173'
    const proxied = await fetch(url.toString(), {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    })
    return new Response(proxied.body, {
      status: proxied.status,
      headers: proxied.headers,
    })
  })

  // eslint-disable-next-line no-console
  console.log(`Started development server: http://localhost:${port}`)
  // eslint-disable-next-line no-console
  console.log(`  Vite dev server proxied from: ${VITE_DEV_ORIGIN}`)

  return { fetch: app.fetch, port, idleTimeout: 120 }
}

export default import.meta.main ? startDev() : undefined
