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
 */
export const delegateTool = tool({
  description: `Delegate a specific task to a specialized sub-agent.

Use this when you need specialized expertise or want to parallelize work:
- Code review: delegate to a review agent with code quality expertise
- Documentation: delegate to a doc writing agent
- Testing: delegate to a test generation agent
- Research: delegate to a research agent for deep investigation
- Refactoring: delegate to a refactoring expert agent

IMPORTANT: Always provide a descriptive 'agent_name' that clearly indicates what this sub-agent does for this specific task (e.g., "xx专家", "xx助手"). The name will be displayed to the user.`,
  inputSchema: z.object({
    agent_name: z.string().describe('A descriptive name for this sub-agent that indicates its purpose for this specific task (e.g., "React性能分析专家", "API文档编写助手"). This will be displayed to the user.'),
    agent_type: z.enum([
      'code_review',
      'doc_writer',
      'test_generator',
      'researcher',
      'refactor_expert',
      'custom',
    ]).describe('The type of sub-agent to delegate to (determines system prompt preset)'),
    task: z.string().describe('The specific task description for the sub-agent'),
    context: z.string().optional().describe('Additional context, code snippets, or background information'),
    custom_system_prompt: z.string().optional().describe('Custom system prompt when agent_type is "custom"'),
    max_iterations: z.number().optional().describe('Maximum iterations for the sub-agent (default: 10)'),
  }),
})

/**
 * 共享的子代理基础提示词
 * 强调：子代理的任务是为主代理提供信息，而不是直接给出完美答案
 */
const SUB_AGENT_BASE_PROMPT = `IMPORTANT: You are NOT the final responder to the user. Your job is to gather and STRUCTURE information for the main agent (parent agent).

Your output must be:
- Concise and dense - prioritize information density over completeness
- Structured data only - bullet points, tables, key-value pairs
- No narrative text - no introductions, explanations, or conclusions
- No markdown headers (no "##" or "###")
- Maximum 1000 tokens - be selective, parent agent will expand

The main agent will use your structured findings to write the final response.`

/**
 * 子代理默认工具超时（毫秒）
 * 防止 MCP 等外部工具长时间不返回导致阻塞
 */
const SUB_AGENT_TOOL_TIMEOUT_MS = 60_000 // 60 秒

/**
 * 预定义的子代理配置
 */
const SUB_AGENT_PRESETS: Record<string, Omit<SubAgentConfig, 'name'>> = {
  code_review: {
    systemPrompt: `${SUB_AGENT_BASE_PROMPT}

You are a code review specialist. Focus on:
- Bugs, security issues, performance problems
- Code smells and anti-patterns
- Specific line numbers for issues
- Quick suggestions (no need for full explanations)

Output format:
- Issues: bullet list with line refs
- Suggestions: brief code snippets
- Severity: critical/major/minor`,
    maxIterations: 5,
    thinkingMode: true,
  },
  doc_writer: {
    systemPrompt: `${SUB_AGENT_BASE_PROMPT}

You are a documentation specialist. Generate:
- API signatures with parameter descriptions
- Usage examples (concise)
- Key behavior notes

Format: Markdown, no intro/outro text.`,
    maxIterations: 3,
    thinkingMode: false,
  },
  test_generator: {
    systemPrompt: `${SUB_AGENT_BASE_PROMPT}

You are a test generation specialist. Provide:
- Test case list (what to test, not always full code)
- Key test scenarios (happy path, edge cases, error cases)
- Optional: critical test code snippets

Focus on completeness over perfect code.`,
    maxIterations: 5,
    thinkingMode: true,
  },
  researcher: {
    systemPrompt: `${SUB_AGENT_BASE_PROMPT}

You are a research specialist. Gather:
- Key facts and data points
- Relevant file contents
- Technical details and specs
- Options/comparisons (if applicable)

Structure: Bullet points, no narrative wrap-up.`,
    maxIterations: 15,
    thinkingMode: true,
  },
  refactor_expert: {
    systemPrompt: `${SUB_AGENT_BASE_PROMPT}

You are a refactoring specialist. Analyze and report:
- Code smells found (with locations)
- Refactoring strategy (brief)
- Changes made (file + line refs)
- Risks or things to verify

Be tactical, not academic.`,
    maxIterations: 10,
    thinkingMode: true,
  },
}

/**
 * Delegate 工具执行参数
 */
export interface DelegateArgs {
  agent_name: string
  agent_type: keyof typeof SUB_AGENT_PRESETS | 'custom'
  task: string
  context?: string
  custom_system_prompt?: string
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
 */
function getSubAgentConfig(
  args: DelegateArgs,
  defaultModel: LanguageModel,
): SubAgentConfig {
  const preset = args.agent_type === 'custom'
    ? {
        systemPrompt: args.custom_system_prompt || 'You are a helpful assistant.',
        maxIterations: args.max_iterations ?? 10,
        thinkingMode: true,
      }
    : SUB_AGENT_PRESETS[args.agent_type]

  return {
    name: args.agent_name || args.agent_type,
    ...preset,
    model: defaultModel,
    maxIterations: args.max_iterations ?? preset.maxIterations,
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
