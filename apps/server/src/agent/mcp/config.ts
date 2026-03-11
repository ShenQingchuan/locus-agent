import type { MCPServersConfig } from '@univedge/locus-agent-sdk'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { settings as settingsTable } from '../../db/schema.js'

const MCP_CONFIG_KEY = 'mcp.servers'

/**
 * 读取 MCP 配置
 */
export async function getMCPConfig(): Promise<MCPServersConfig> {
  const rows = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, MCP_CONFIG_KEY))
    .limit(1)

  if (rows.length === 0) {
    return { mcpServers: {} }
  }

  try {
    return JSON.parse(rows[0].value) as MCPServersConfig
  }
  catch {
    return { mcpServers: {} }
  }
}

/**
 * 保存 MCP 配置
 */
export async function saveMCPConfig(config: MCPServersConfig): Promise<void> {
  const value = JSON.stringify(config)

  const existing = await db
    .select({ key: settingsTable.key })
    .from(settingsTable)
    .where(eq(settingsTable.key, MCP_CONFIG_KEY))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(settingsTable)
      .set({ value, updatedAt: new Date() })
      .where(eq(settingsTable.key, MCP_CONFIG_KEY))
  }
  else {
    await db.insert(settingsTable).values({ key: MCP_CONFIG_KEY, value })
  }
}
