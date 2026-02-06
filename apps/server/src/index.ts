import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { chatRoutes } from './routes/chat.js'
import { conversationsRoutes } from './routes/conversations.js'

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

const port = Number(Bun.env.PORT) || 3000

// eslint-disable-next-line no-console
console.log(`Server is running on http://localhost:${port}`)

export default {
  fetch: app.fetch,
  port,
  idleTimeout: 120,
}
