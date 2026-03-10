import type { InstallOptions } from '@locus-agent/plugin-kit'
import { Hono } from 'hono'
import { pluginManager } from '../agent/plugins/index.js'

export const pluginRoutes = new Hono()

// GET /api/plugins - List installed plugins
pluginRoutes.get('/', (c) => {
  const records = pluginManager.listRecords()
  const instances = pluginManager.listPlugins()
  const stateMap = new Map(instances.map(p => [p.manifest.id, p.state]))

  const items = records.map(record => ({
    ...record,
    runtimeState: stateMap.get(record.id) ?? 'inactive',
  }))

  return c.json({ success: true, plugins: items })
})

// POST /api/plugins/install - Install a new plugin
pluginRoutes.post('/install', async (c) => {
  const body = await c.req.json<InstallOptions>()

  if (!body.source || !body.sourceType) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'source and sourceType are required',
        },
      },
      400,
    )
  }

  try {
    const instance = await pluginManager.install(body)
    return c.json({
      success: true,
      plugin: {
        id: instance.manifest.id,
        name: instance.manifest.name,
        version: instance.manifest.version,
        state: instance.state,
      },
    })
  }
  catch (err) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INSTALL_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    )
  }
})

// POST /api/plugins/:id/activate - Activate a plugin
pluginRoutes.post('/:id/activate', async (c) => {
  const pluginId = c.req.param('id')
  try {
    await pluginManager.activate(pluginId)
    return c.json({ success: true })
  }
  catch (err) {
    return c.json(
      {
        success: false,
        error: {
          code: 'ACTIVATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    )
  }
})

// POST /api/plugins/:id/deactivate - Deactivate a plugin
pluginRoutes.post('/:id/deactivate', async (c) => {
  const pluginId = c.req.param('id')
  try {
    await pluginManager.deactivate(pluginId)
    return c.json({ success: true })
  }
  catch (err) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DEACTIVATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    )
  }
})

// DELETE /api/plugins/:id - Uninstall a plugin
pluginRoutes.delete('/:id', async (c) => {
  const pluginId = c.req.param('id')
  try {
    await pluginManager.uninstall(pluginId)
    return c.json({ success: true })
  }
  catch (err) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNINSTALL_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      400,
    )
  }
})
