import type { LanguageModel, ModelMessage } from 'ai'
import type { AgentLoopResult } from '../loop.js'
import { tool } from 'ai'
import { z } from 'zod'
import { runAgentLoop } from '../loop.js'

/**
 * 子代理配置定义
 */
export interface SubAgentConfig {
  /** 代理名称 */
  name: string
  /** 系统提示词（专注于特定任务） */
  systemPrompt: string
  /** 使用的模型（默认使用主代理相同的模型） */
  model?: LanguageModel
  /** 可用工具列表（undefined = 使用所有工具） */
  tools?: string[]
  /** 最大迭代次数 */
  maxIterations?: number
  /** 是否启用思考模式 */
  thinkingMode?: boolean
}

/**
 * Delegate 工具定义
 * 用于将任务委派给专门的子代理处理
 * 注意：需要调用方提供完整的 system_prompt，系统不再内置任何预设
 */
export const delegateTool = tool({
  description: `Delegate a specific task to a specialized sub-agent.

Use this when you need specialized expertise or want to parallelize work.
You must provide a complete 'system_prompt' that defines the sub-agent's behavior, expertise, and output format.

Example system_prompt structure:
- Define the specialist role (e.g., "You are a security auditor...")
- Specify focus areas and tasks
- Define output format requirements
- Add any constraints or guidelines

IMPORTANT: Always provide a descriptive 'agent_name' that clearly indicates what this sub-agent does for this specific task.`,
  inputSchema: z.object({
    agent_name: z.string().describe('A descriptive name for this sub-agent that indicates its purpose for this specific task (e.g., "React性能分析专家", "API文档编写助手"). This will be displayed to the user.'),
    agent_type: z.string().describe('The type of sub-agent to delegate to. Can be any descriptive type like "code_review", "doc_writer", "test_generator", "security_auditor", etc. Choose the most appropriate type based on the task at hand.'),
    task: z.string().describe('The specific task description for the sub-agent'),
    context: z.string().optional().describe('Additional context, code snippets, or background information'),
    system_prompt: z.string().describe('The complete system prompt that defines the sub-agent\'s behavior, expertise, and output format. This is required and should be tailored to the specific task.'),
    max_iterations: z.number().optional().describe('Maximum iterations for the sub-agent (default: 10)'),
  }),
})

/**
 * 子代理默认工具超时（毫秒）
 * 防止 MCP 等外部工具长时间不返回导致阻塞
 */
const SUB_AGENT_TOOL_TIMEOUT_MS = 60_000 // 60 秒

/**
 * Delegate 工具执行参数
 * LLM 在调用时需要提供完整的 system_prompt，不再有任何内置预设
 */
export interface DelegateArgs {
  agent_name: string
  /** 子代理类型描述，用于标识和展示 */
  agent_type: string
  task: string
  context?: string
  /** 完整的系统提示词，由 LLM 在运行时根据任务需求自行定义 */
  system_prompt: string
  max_iterations?: number
}

/**
 * Delegate 工具执行结果
 */
export interface DelegateResult {
  success: boolean
  agentName: string
  agentType: string
  result: string
  iterations: number
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

/**
 * 构建子代理的输入消息
 */
function buildSubAgentMessages(args: DelegateArgs): ModelMessage[] {
  const content = [`## Task\n${args.task}`]

  if (args.context) {
    content.push(`\n## Context\n${args.context}`)
  }

  return [
    {
      role: 'user',
      content: content.join('\n'),
    },
  ]
}

/**
 * 获取子代理配置
 * 完全由调用方提供的 system_prompt 决定子代理的行为
 */
function getSubAgentConfig(
  args: DelegateArgs,
  defaultModel: LanguageModel,
): SubAgentConfig {
  return {
    name: args.agent_name || args.agent_type,
    systemPrompt: args.system_prompt,
    model: defaultModel,
    maxIterations: args.max_iterations ?? 10,
    thinkingMode: true,
  }
}

/**
 * Delegate 执行状态回调
 */
export interface DelegateCallbacks {
  /** 子代理文本输出回调 */
  onTextDelta?: (delta: string) => void | Promise<void>
  /** 子代理思考过程回调 */
  onReasoningDelta?: (delta: string) => void | Promise<void>
  /** 子代理工具调用开始回调 */
  onToolCallStart?: (toolCallId: string, toolName: string, args: unknown) => void | Promise<void>
  /** 子代理工具调用结果回调 */
  onToolCallResult?: (toolCallId: string, toolName: string, result: unknown, isError: boolean) => void | Promise<void>
}

/**
 * 执行 Delegate 工具
 * @param args 工具参数
 * @param defaultModel 默认模型（继承自主代理）
 * @param callbacks 可选的流式状态回调
 * @returns 子代理执行结果
 */
export async function executeDelegate(
  args: DelegateArgs,
  defaultModel: LanguageModel,
  callbacks?: DelegateCallbacks,
): Promise<DelegateResult> {
  const config = getSubAgentConfig(args, defaultModel)
  const messages = buildSubAgentMessages(args)

  try {
    const result: AgentLoopResult = await runAgentLoop({
      messages,
      systemPrompt: config.systemPrompt,
      model: config.model ?? defaultModel,
      maxIterations: config.maxIterations ?? 10,
      thinkingMode: config.thinkingMode ?? true,
      toolTimeoutMs: SUB_AGENT_TOOL_TIMEOUT_MS, // 子代理工具超时
      onTextDelta: callbacks?.onTextDelta,
      onReasoningDelta: callbacks?.onReasoningDelta,
      onToolCallStart: callbacks?.onToolCallStart ?? ((_id, name, _args) => {
        console.warn(`[SubAgent:${config.name}] Tool: ${name}`)
      }),
      onToolCallResult: callbacks?.onToolCallResult,
    })

    return {
      success: true,
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
      agentName: args.agent_name || args.agent_type,
      agentType: args.agent_type,
      result: `Sub-agent failed: ${errorMessage}`,
      iterations: 0,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }
  }
}

/**
 * 格式化 Delegate 结果为字符串
 */
export function formatDelegateResult(result: DelegateResult): string {
  const parts = [
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
