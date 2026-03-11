import type { MCPServersConfig } from '@univedge/locus-agent-sdk'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { getMCPConfig, saveMCPConfig } from '../agent/mcp/config.js'
import { mcpManager } from '../agent/mcp/manager.js'

export const mcpRoutes = new Hono()

/**
 * GET /api/mcp/config — 获取 MCP 配置
 */
mcpRoutes.get('/config', async (c) => {
  try {
    const config = await getMCPConfig()
    return c.json(config)
  }
  catch (error) {
    return c.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

const mcpServerConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
  transportType: z.enum(['sse', 'http']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  disabled: z.boolean().optional(),
})

const updateConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
})

/**
 * PUT /api/mcp/config — 更新 MCP 配置并重连
 */
mcpRoutes.put('/config', async (c) => {
  const json = await c.req.json().catch(() => null)
  const parsed = updateConfigSchema.safeParse(json)
  if (!parsed.success) {
    return c.json(
      { success: false, message: 'Invalid MCP config', issues: parsed.error.issues },
      400,
    )
  }

  try {
    await saveMCPConfig(parsed.data as MCPServersConfig)
    await mcpManager.reload()
    return c.json({
      success: true,
      status: mcpManager.getStatus(),
    })
  }
  catch (error) {
    return c.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

/**
 * GET /api/mcp/status — 获取所有 MCP Server 运行时状态
 */
mcpRoutes.get('/status', (c) => {
  return c.json(mcpManager.getStatus())
})

/**
 * GET /api/mcp/logs — 获取 MCP 聚合日志（最多最近 1000 行）
 */
mcpRoutes.get('/logs', (c) => {
  const limitRaw = c.req.query('limit')
  const parsed = Number.parseInt(limitRaw ?? '', 10)
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 1000) : 1000
  return c.json({
    lines: mcpManager.getLogs(limit),
  })
})

/**
 * POST /api/mcp/restart — 重启所有 MCP 连接
 */
mcpRoutes.post('/restart', async (c) => {
  try {
    await mcpManager.reload()
    return c.json({ success: true, status: mcpManager.getStatus() })
  }
  catch (error) {
    return c.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

/**
 * POST /api/mcp/restart/:name — 重启指定 MCP Server
 */
mcpRoutes.post('/restart/:name', async (c) => {
  const { name } = c.req.param()
  try {
    await mcpManager.restartServer(name)
    return c.json({ success: true, status: mcpManager.getStatus() })
  }
  catch (error) {
    return c.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

/**
 * GET /api/mcp/events — SSE 订阅 MCP 状态变化
 */
mcpRoutes.get('/events', async (c) => {
  return streamSSE(c, async (stream) => {
    // 发送当前状态作为初始化
    const currentStatus = mcpManager.getStatus()
    await stream.writeSSE({
      event: 'init',
      data: JSON.stringify(currentStatus),
    })

    // 监听状态变化
    const listener = (event: { name: string, status: string, error?: string, tools: string[], disabled: boolean }) => {
      stream.writeSSE({
        event: 'statusChange',
        data: JSON.stringify(event),
      }).catch(() => {
        // 客户端断开时忽略写入错误
      })
    }

    mcpManager.on('statusChange', listener)

    // 保持连接直到客户端断开
    try {
      // 每 30 秒发送 ping 保持连接
      while (true) {
        await stream.sleep(30000)
        await stream.writeSSE({ event: 'ping', data: '' })
      }
    }
    catch {
      // 客户端断开或出错，清理监听器
    }
    finally {
      mcpManager.off('statusChange', listener)
    }
  })
})
