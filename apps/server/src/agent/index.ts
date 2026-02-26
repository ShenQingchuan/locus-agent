/**
 * Agent module entry point.
 * Exports the agent loop and all tool-related functions/types.
 */

export { runAgentLoop } from './loop.js'
export type { AgentLoopOptions, AgentLoopResult } from './loop.js'

export { bashTool, executeBash, formatBashResult } from './tools/bash.js'
// Delegate (Sub-agent)
export { delegateTool, executeDelegate, formatDelegateResult } from './tools/delegate.js'
export type { DelegateArgs, DelegateResult, SubAgentConfig } from './tools/delegate.js'
export { executeGlob, formatGlobResult, globTool } from './tools/glob.js'
export { executeReadFile, formatReadResult, readFileTool } from './tools/read.js'
export { executeToolCall, executeToolCallRaw, getAvailableTools, hasToolExecutor, tools } from './tools/registry.js'

export type { BashResult, GlobResult, ReadFileResult, StrReplaceResult, ToolName, WriteFileResult } from './tools/registry.js'

export { executeStrReplace, formatStrReplaceResult, strReplaceTool } from './tools/str-replace.js'
export { executeWriteFile, formatWriteResult, writeFileTool } from './tools/write.js'
