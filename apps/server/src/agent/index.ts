/**
 * Agent 模块入口
 * 导出 Agent Loop 和工具相关的功能
 */

export { runAgentLoop } from './loop.js'
export type { AgentLoopOptions, AgentLoopResult } from './loop.js'

export { bashTool, executeBash, formatBashResult } from './tools/bash.js'
export { executeToolCall, executeToolCallRaw, getAvailableTools, hasToolExecutor, tools } from './tools/registry.js'

export type { BashResult, ToolName } from './tools/registry.js'
