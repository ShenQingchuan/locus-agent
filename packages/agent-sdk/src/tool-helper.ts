/**
 * tool() helper — create tools using Zod schemas.
 *
 * Requires `zod` as a peer dependency (optional). Import this module only
 * when Zod is available in the consuming project.
 *
 * Compatible with the open-agent-sdk pattern and the official Claude Agent SDK.
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { tool } from '@univedge/locus-agent-sdk/tool-helper'
 *
 * const weatherTool = tool(
 *   'get_weather',
 *   'Get current weather for a city',
 *   { city: z.string().describe('City name') },
 *   async ({ city }) => ({
 *     content: [{ type: 'text', text: `Weather in ${city}: 22°C` }],
 *   }),
 * )
 * ```
 *
 * @module tool-helper
 */

import type { infer as ZodInfer, ZodObject, ZodRawShape } from 'zod'
import type { ToolDefinition } from './types/tool.js'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** MCP-compatible tool annotations for execution hints. */
export interface ToolAnnotations {
  /** Hint that this tool only reads data and does not modify state. */
  readOnlyHint?: boolean
  /** Hint that this tool may modify or delete data. */
  destructiveHint?: boolean
  /** Hint that calling the tool multiple times produces the same result. */
  idempotentHint?: boolean
  /** Hint that the tool may interact with external systems. */
  openWorldHint?: boolean
}

/** MCP-compatible tool call result. */
export interface CallToolResult {
  content: Array<
    | { type: 'text', text: string }
    | { type: 'image', data: string, mimeType: string }
    | { type: 'resource', resource: { uri: string, text?: string, blob?: string } }
  >
  isError?: boolean
}

/**
 * A tool definition created with `tool()`, holding the Zod schema and handler.
 * Pass to `sdkToolToToolDefinition()` for use in agent loops, or to
 * `createSdkMcpServer()` for MCP server creation.
 */
export interface SdkToolDefinition<T extends ZodRawShape = ZodRawShape> {
  name: string
  description: string
  inputSchema: ZodObject<T>
  handler: (args: ZodInfer<ZodObject<T>>, extra?: unknown) => Promise<CallToolResult>
  annotations?: ToolAnnotations
}

// ---------------------------------------------------------------------------
// tool() factory
// ---------------------------------------------------------------------------

/**
 * Create a tool definition using a Zod shape.
 *
 * @param name        Tool name (snake_case recommended)
 * @param description Human-readable description for the model
 * @param inputSchema Record of Zod field definitions (like `z.object()` shape)
 * @param handler     Async function receiving validated args and returning a result
 * @param extras      Extra options
 * @param extras.annotations Optional annotations
 */
export function tool<T extends ZodRawShape>(
  name: string,
  description: string,
  inputSchema: T,
  handler: (args: ZodInfer<ZodObject<T>>, extra?: unknown) => Promise<CallToolResult>,
  extras?: { annotations?: ToolAnnotations },
): SdkToolDefinition<T> {
  return {
    name,
    description,
    inputSchema: z.object(inputSchema) as ZodObject<T>,
    handler,
    annotations: extras?.annotations,
  }
}

// ---------------------------------------------------------------------------
// sdkToolToToolDefinition() — convert to the SDK's pure-data ToolDefinition
// ---------------------------------------------------------------------------

/**
 * Convert an `SdkToolDefinition` to the SDK's pure-data `ToolDefinition`.
 *
 * The resulting object contains the JSON Schema for the input parameters and
 * can be passed to agent loop options, tool registries, or MCP server configs.
 */
export function sdkToolToToolDefinition(sdkTool: SdkToolDefinition<ZodRawShape>): ToolDefinition {
  const jsonSchema = z.toJSONSchema(sdkTool.inputSchema) as {
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }

  return {
    name: sdkTool.name,
    description: sdkTool.description,
    parameters: {
      type: 'object',
      properties: jsonSchema.properties ?? {},
      required: jsonSchema.required ?? [],
    },
  }
}
