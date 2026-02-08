/**
 * Agent module entry point.
 * Exports the agent loop and all tool-related functions/types.
 */

export { runAgentLoop } from './loop.js'
export type { AgentLoopOptions, AgentLoopResult } from './loop.js'

export { bashTool, executeBash, formatBashResult } from './tools/bash.js'
export { editFileTool, executeEditFile, formatEditResult } from './tools/edit.js'
export { executeReadFile, formatReadResult, readFileTool } from './tools/read.js'
export { executeToolCall, executeToolCallRaw, getAvailableTools, hasToolExecutor, tools } from './tools/registry.js'

export type { BashResult, EditFileResult, ReadFileResult, ToolName } from './tools/registry.js'
