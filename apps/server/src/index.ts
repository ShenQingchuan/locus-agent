import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { mcpManager } from './agent/mcp/manager.js'
import { pluginManager } from './agent/plugins/index.js'
import { setLLMConfig } from './agent/providers/index.js'
import { setServerConfig } from './config.js'
import { initDB } from './db/index.js'
import { chatRoutes } from './routes/chat.js'
import { conversationsRoutes } from './routes/conversations.js'
import { embeddingRoutes } from './routes/embedding.js'
import { foldersRoutes } from './routes/folders.js'
import { mcpRoutes } from './routes/mcp.js'
import { notesRoutes } from './routes/notes.js'
import { settingsRoutes } from './routes/settings.js'
import { skillsRoutes } from './routes/skills.js'
import { tagsRoutes } from './routes/tags.js'
import { tasksRoutes } from './routes/tasks.js'
import { pluginRoutes } from './routes/plugins.js'
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

  return app
}

// Dev mode: start server only when this file is the entry point (bun --watch src/index.ts)
// Bun launches HTTP server from the entry file's default export
function startDev() {
  // 1. Ensure data directory and initialize DB (runs Drizzle migrations)
  ensureDataDir()
  const dbPath = getSettingsDbPath()
  initDB({ dbPath })

  // 2. Load config from settings DB (uses Drizzle db instance)
  const llmSettings = getLLMSettings()
  if (!llmSettings) {
    throw new Error('LLM settings not configured. Run `locus-agent config` to set up.')
  }
  const port = getServerPort()
  const yoloMode = isYoloMode()

  const VITE_DEV_PORT = 5173
  if (port === VITE_DEV_PORT) {
    throw new Error(`Server port ${port} conflicts with Vite dev server. Change it via \`locus-agent config\`.`)
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

  // 6. Dev proxy: forward non-API requests to Vite dev server for HMR support.
  //    Uses middleware + next() so API routes are tried first;
  //    only unmatched requests (pages, assets) are proxied to Vite.
  app.use('*', async (c, next) => {
    // Let Hono routes handle API and health requests
    if (c.req.path.startsWith('/api/') || c.req.path === '/health') {
      return next()
    }
    // Proxy everything else to Vite dev server
    const url = new URL(c.req.url)
    url.host = 'localhost'
    url.port = String(VITE_DEV_PORT)
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

  return { fetch: app.fetch, port, idleTimeout: 255 }
}

export default import.meta.main ? startDev() : undefined
