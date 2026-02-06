import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { config } from './config.js'
import { chatRoutes } from './routes/chat.js'
import { conversationsRoutes } from './routes/conversations.js'

/**
 * 创建 Hono 应用实例（不启动服务）
 * CLI 和 dev 模式共用此工厂
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

// Dev 模式：仅当直接运行此文件时启动服务（bun --watch src/index.ts）
// Bun 只对入口文件的 default export 启动 HTTP 服务
function startDev() {
  const app = createApp()
  const port = config.port

  // eslint-disable-next-line no-console
  console.log(`Server is running on http://localhost:${port}`)

  return { fetch: app.fetch, port, idleTimeout: 120 }
}

export default import.meta.main ? startDev() : undefined
