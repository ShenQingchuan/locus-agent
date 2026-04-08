import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { mcpManager } from './agent/mcp/manager.js'
import { pluginManager } from './agent/plugins/index.js'
import { setLLMConfig } from './agent/providers/index.js'
import { config, setServerConfig } from './config.js'
import { initDB } from './db/index.js'
import { approvalRoutes } from './routes/approval.js'
import { chatRoutes } from './routes/chat.js'
import { conversationsRoutes } from './routes/conversations.js'
import { embeddingRoutes } from './routes/embedding.js'
import { foldersRoutes } from './routes/folders.js'
import { mcpRoutes } from './routes/mcp.js'
import { notesRoutes } from './routes/notes.js'
import { pluginRoutes } from './routes/plugins.js'
import { reviewAnnotationsRoutes } from './routes/reviewAnnotations.js'
import { settingsRoutes } from './routes/settings.js'
import { skillsRoutes } from './routes/skills.js'
import { tagsRoutes } from './routes/tags.js'
import { tasksRoutes } from './routes/tasks.js'
import { whitelistRoutes } from './routes/whitelist.js'
import { workspaceRoutes } from './routes/workspace.js'
import {
  ensureDataDir,
  getLLMSettings,
  getServerPort,
  getSettingsDbPath,
  isYoloMode,
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
      origin: config.allowedOrigins,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  )

  // Health check
  app.get('/health', c => c.json({ status: 'ok' }))

  // Routes
  app.route('/api/chat', chatRoutes)
  app.route('/api/chat', approvalRoutes)
  app.route('/api/chat/whitelist', whitelistRoutes)
  app.route('/api/conversations', conversationsRoutes)
  app.route('/api/notes', notesRoutes)
  app.route('/api/folders', foldersRoutes)
  app.route('/api/tags', tagsRoutes)
  app.route('/api/settings', settingsRoutes)
  app.route('/api/skills', skillsRoutes)
  app.route('/api/embedding', embeddingRoutes)
  app.route('/api/mcp', mcpRoutes)
  app.route('/api/tasks', tasksRoutes)
  app.route('/api/workspace', workspaceRoutes)
  app.route('/api/plugins', pluginRoutes)
  app.route('/api/review-annotations', reviewAnnotationsRoutes)

  return app
}

// Dev mode: start server only when this file is the entry point (tsx --watch src/index.ts)
// Bun launches HTTP server from the entry file's default export
function startDev() {
  // 1. Ensure data directory and initialize DB (runs Drizzle migrations)
  ensureDataDir()
  const dbPath = getSettingsDbPath()
  initDB({ dbPath })

  // 2. Load config from settings DB (uses Drizzle db instance).
  // Allow dev startup without LLM credentials so the server and UI remain usable.
  const llmSettings = getLLMSettings() ?? {
    provider: 'openai' as const,
    apiKey: '',
    apiBase: undefined,
    model: undefined,
  }
  const yoloMode = isYoloMode()

  /**
   * Unified dev (`pnpm dev`): Bun serves API only on LOCUS_API_PORT (e.g. 3001); Vite is the browser entry on :3000.
   * Legacy: Bun on `server.port` (e.g. 3000) and proxies static assets to Vite on 5173.
   */
  const apiOnlyPort = process.env.LOCUS_API_PORT
  const port = apiOnlyPort != null && apiOnlyPort !== ''
    ? Number(apiOnlyPort)
    : getServerPort()

  if (apiOnlyPort != null && apiOnlyPort !== '' && Number.isNaN(port)) {
    throw new Error(`Invalid LOCUS_API_PORT: ${apiOnlyPort}`)
  }

  const VITE_LEGACY_PORT = 5173
  if (apiOnlyPort == null || apiOnlyPort === '') {
    if (port === VITE_LEGACY_PORT) {
      throw new Error(`Server port ${port} conflicts with Vite dev server. Change it via \`locus-agent config\`.`)
    }
  }

  // 3. Inject configs (same as CLI mode)
  setLLMConfig(llmSettings)
  setServerConfig({ confirmMode: !yoloMode, port })

  // 4. Initialize MCP servers (non-blocking — errors are logged, not thrown)
  mcpManager.initialize().catch((err) => {
    console.error('MCP initialization failed:', err)
  })

  // 4.5. Initialize plugins (non-blocking)
  pluginManager.initialize().catch((err) => {
    console.error('Plugin initialization failed:', err)
  })

  // 5. Create app
  const app = createApp()

  // 6. Legacy dev only: Bun proxies static/HMR to Vite. When LOCUS_API_PORT is set, Vite fronts the browser instead.
  if (apiOnlyPort == null || apiOnlyPort === '') {
    app.use('*', async (c, next) => {
      if (c.req.path.startsWith('/api/') || c.req.path === '/health') {
        return next()
      }
      const url = new URL(c.req.url)
      url.host = 'localhost'
      url.port = String(VITE_LEGACY_PORT)
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
  }

  serve({ fetch: app.fetch, port }, () => {
    // eslint-disable-next-line no-console
    console.log(`Started development server: http://localhost:${port}`)
  })
}

// Dev mode: start server only when this file is the entry point
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  startDev()
}
