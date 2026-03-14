import type { DelegateArgs, DelegateCallbacks, DelegateResult, SubAgentConfig } from '@univedge/locus-agent-sdk'
import type { LanguageModel, ModelMessage } from 'ai'
import type { AgentLoopResult } from '../loop.js'
import { BuiltinTool } from '@univedge/locus-agent-sdk'
import { tool } from 'ai'
import { z } from 'zod'
import { getDelegateSession, upsertDelegateSession } from '../../services/delegate-session.js'
import { runAgentLoop } from '../loop.js'
import { MEMORY_TAGGER_SYSTEM_PROMPT } from '../prompts/memory-tagger.js'

interface DelegateSessionState {
  taskId: string
  conversationId?: string
  agentName: string
  agentType: string
  systemPrompt: string
  messages: ModelMessage[]
  createdAt: number
  updatedAt: number
}

function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getPresetByAgentType(agentType: string): { systemPrompt?: string, tools?: string[] } {
  const normalized = agentType.trim().toLowerCase()

  if (normalized === 'explore') {
    return {
      systemPrompt: `You are an explore sub-agent specialized in codebase discovery.
Focus on searching, reading, and analysis. Prefer read-only actions.
For implementation requests, provide findings and actionable recommendations.`,
      tools: [
        BuiltinTool.ReadFile,
        BuiltinTool.Glob,
        BuiltinTool.Grep,
        BuiltinTool.Bash,
        BuiltinTool.ManageMemory,
        BuiltinTool.ReadPlan,
        BuiltinTool.AskQuestion,
      ],
    }
  }

  if (normalized === 'memory_tagger' || normalized === 'memory-tagger') {
    return {
      systemPrompt: MEMORY_TAGGER_SYSTEM_PROMPT,
      tools: [BuiltinTool.SearchMemory],
    }
  }

  return {
    systemPrompt: `You are a general-purpose sub-agent.
Execute multi-step tasks efficiently and return concise, actionable results.`,
  }
}

export const delegateTool = tool({
  description: `
Delegate a specific task to a specialized sub-agent.

Use this when you need specialized expertise or want to parallelize work.
You can provide 'system_prompt' for custom behavior; if omitted, built-in defaults are used by agent_type.
Reuse 'task_id' to continue an existing sub-task thread.

Example system_prompt structure:
- Define the specialist role (e.g., "You are a security auditor...")
- Specify focus areas and tasks
- Define output format requirements
- Add any constraints or guidelines

IMPORTANT:
- Always provide a descriptive 'agent_name' that clearly indicates what this sub-agent does.
- Prefer reusing task_id for follow-up work in the same sub-task.
- Prefer agent_type='explore' for read-only oriented exploration.`,
  inputSchema: z.object({
    agent_name: z.string().describe('A descriptive name for this sub-agent that indicates its purpose for this specific task (e.g., "React性能分析专家", "API文档编写助手"). This will be displayed to the user.'),
    agent_type: z.string().describe('The type of sub-agent to delegate to. Can be any descriptive type like "code_review", "doc_writer", "test_generator", "security_auditor", etc. Choose the most appropriate type based on the task at hand.'),
    task: z.string().describe('The specific task description for the sub-agent'),
    context: z.string().optional().describe('Additional context, code snippets, or background information'),
    system_prompt: z.string().optional().describe('The complete system prompt for this sub-agent. Recommended for custom behavior. If omitted, built-in defaults are used based on agent_type.'),
    max_iterations: z.number().optional().describe('Maximum iterations for the sub-agent (default: 10)'),
    task_id: z.string().optional().describe('Optional task session id for resuming an existing delegate sub-task'),
    command: z.string().optional().describe('Optional command that triggered this delegation'),
  }),
})

const SUB_AGENT_TOOL_TIMEOUT_MS = 60_000

function buildSubAgentMessages(args: DelegateArgs): ModelMessage[] {
  const content = [`## Task\n${args.task}`]

  if (args.context) {
    content.push(`\n## Context\n${args.context}`)
  }

  if (args.command?.trim()) {
    content.push(`\n## Trigger Command\n${args.command.trim()}`)
  }

  return [
    {
      role: 'user',
      content: content.join('\n'),
    },
  ]
}

function getSubAgentConfig(
  args: DelegateArgs,
  defaultModel: LanguageModel,
): SubAgentConfig {
  const preset = getPresetByAgentType(args.agent_type)

  return {
    name: args.agent_name || args.agent_type,
    systemPrompt: args.system_prompt?.trim() || preset.systemPrompt || 'You are a helpful sub-agent.',
    model: defaultModel,
    tools: preset.tools,
    maxIterations: args.max_iterations ?? 10,
    thinkingMode: true,
  }
}

export async function executeDelegate(
  args: DelegateArgs,
  defaultModel: LanguageModel,
  callbacks?: DelegateCallbacks,
): Promise<DelegateResult> {
  const config = getSubAgentConfig(args, defaultModel)

  let session: DelegateSessionState | undefined
  if (args.task_id) {
    const persisted = await getDelegateSession(args.task_id)
    if (persisted) {
      session = {
        ...persisted,
        conversationId: persisted.conversationId ?? callbacks?.conversationId,
      }
    }
  }

  if (!session) {
    const taskId = args.task_id ?? createTaskId()
    session = {
      taskId,
      conversationId: callbacks?.conversationId,
      agentName: args.agent_name || args.agent_type,
      agentType: args.agent_type,
      systemPrompt: config.systemPrompt,
      messages: buildSubAgentMessages(args),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }
  else {
    session.conversationId = callbacks?.conversationId ?? session.conversationId
    session.agentName = args.agent_name || session.agentName
    session.agentType = args.agent_type || session.agentType
    if (args.system_prompt?.trim()) {
      session.systemPrompt = args.system_prompt.trim()
    }
    session.messages.push(...buildSubAgentMessages(args))
    session.updatedAt = Date.now()
  }

  try {
    const result: AgentLoopResult = await runAgentLoop({
      messages: [...session.messages],
      systemPrompt: session.systemPrompt,
      model: config.model as LanguageModel ?? defaultModel,
      maxIterations: config.maxIterations ?? 10,
      thinkingMode: config.thinkingMode ?? true,
      space: callbacks?.space,
      codingMode: callbacks?.codingMode,
      conversationId: callbacks?.conversationId,
      projectKey: callbacks?.projectKey,
      workspaceRoot: callbacks?.workspaceRoot,
      toolTimeoutMs: SUB_AGENT_TOOL_TIMEOUT_MS,
      toolAllowlist: config.tools,
      onTextDelta: callbacks?.onTextDelta,
      onReasoningDelta: callbacks?.onReasoningDelta,
      onToolCallStart: callbacks?.onToolCallStart ?? ((_id, name, _args) => {
        console.warn(`[SubAgent:${config.name}] Tool: ${name}`)
      }),
      onToolCallResult: callbacks?.onToolCallResult,
    })

    session.messages = result.messages
    session.updatedAt = Date.now()
    await upsertDelegateSession(session)

    return {
      success: true,
      taskId: session.taskId,
      agentName: args.agent_name || args.agent_type,
      agentType: args.agent_type,
      result: result.text,
      iterations: result.iterations,
      usage: result.usage,
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      taskId: session.taskId,
      agentName: args.agent_name || args.agent_type,
      agentType: args.agent_type,
      result: `Sub-agent failed: ${errorMessage}`,
      iterations: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }
  }
}

export function formatDelegateResult(result: DelegateResult): string {
  const parts = [
    `task_id: ${result.taskId} (for resuming this delegate task later)`,
    '',
    `## Delegate Result: ${result.agentName}`,
    `Type: ${result.agentType}`,
    `Success: ${result.success}`,
    `Iterations: ${result.iterations}`,
    `Tokens: ${result.usage.totalTokens} (in: ${result.usage.inputTokens}, out: ${result.usage.outputTokens})`,
    '',
    '---',
    '',
    result.result,
  ]

  return parts.join('\n')
}
