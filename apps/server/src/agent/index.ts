/**
 * Agent module entry point.
 * Exports the agent loop and all tool-related functions.
 *
 * Shared types (DelegateArgs, DelegateResult, SubAgentConfig, ToolExecutionContext, etc.)
 * should be imported directly from @locus-agent/agent-sdk.
 */

export { runAgentLoop } from './loop.js'
export type { AgentLoopOptions, AgentLoopResult } from './loop.js'

export { bashTool, executeBash, formatBashResult } from './tools/bash.js'
export { delegateTool, executeDelegate, formatDelegateResult } from './tools/delegate.js'
export { executeGlob, formatGlobResult, globTool } from './tools/glob.js'
export { executeReadFile, formatReadResult, readFileTool } from './tools/read.js'
export { executeToolCall, executeToolCallRaw, getAvailableTools, hasToolExecutor, tools } from './tools/registry.js'

export { executeStrReplace, formatStrReplaceResult, strReplaceTool } from './tools/str-replace.js'
export { executeWriteFile, formatWriteResult, writeFileTool } from './tools/write.js'
