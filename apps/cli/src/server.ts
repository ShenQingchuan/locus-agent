import { resolve } from 'node:path'
import { serveStatic } from 'hono/bun'
import { createApp } from '@locus-agent/server'
import { initDB } from '@locus-agent/server/db'
import { setServerConfig } from '@locus-agent/server/config'
import { setLLMConfig } from '@locus-agent/server/providers'
import type { LLMSettings } from '@locus-agent/server/settings'

export interface StartOptions {
  dbPath: string
  migrationsFolder: string
  llmSettings: LLMSettings
  port: number
  webDistDir: string
  yoloMode: boolean
}

/**
 * 配置并启动 Hono 服务（API + 静态页面）
 */
export function startServer(options: StartOptions): void {
  const { dbPath, migrationsFolder, llmSettings, port, webDistDir, yoloMode } = options

  // 1. 初始化数据库（运行 Drizzle migrations）
  initDB({ dbPath, migrationsFolder })

  // 2. 注入 LLM 配置
  setLLMConfig({
    provider: llmSettings.provider,
    apiKey: llmSettings.apiKey,
    apiBase: llmSettings.apiBase,
    model: llmSettings.model,
  })

  // 3. 注入服务器配置
  setServerConfig({
    confirmMode: !yoloMode,
    port,
  })

  // 4. 创建 Hono 应用（包含 API 路由）
  const app = createApp()

  // 5. 挂载静态文件服务
  app.use('/assets/*', serveStatic({ root: webDistDir }))

  // SPA fallback：非 API 路由返回 index.html
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ error: 'Not found' }, 404)
    }
    return new Response(Bun.file(resolve(webDistDir, 'index.html')))
  })

  // 6. 启动服务
  Bun.serve({
    fetch: app.fetch,
    port,
    idleTimeout: 120,
  })

  // eslint-disable-next-line no-console
  console.log(`\nLocus Agent is running at http://localhost:${port}\n`)
}
