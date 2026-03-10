/**
 * 工具调用白名单类型定义
 * 用于在确认模式下自动放行匹配的工具调用
 */
import { BuiltinTool } from '../runtime/tool.js'

/**
 * 风险等级
 */
export type RiskLevel = 'dangerous' | 'moderate' | 'safe'

/**
 * 白名单规则
 */
export interface WhitelistRule {
  /** 规则唯一标识 */
  id: string
  /** 工具名称，如 'bash', 'read_file', 'str_replace', 'write_file' 或 MCP 工具名 */
  toolName: string
  /** 匹配模式（仅 bash 工具使用）：命令前缀，如 'ls', 'git status' */
  pattern?: string
  /** 作用域：session = 仅本次会话, global = 全局永久 */
  scope: 'session' | 'global'
  /** 创建时间（Unix 毫秒时间戳） */
  createdAt: number
}

/**
 * 添加白名单请求（嵌入在 ToolApprovalRequest 中）
 */
export interface AddToWhitelistPayload {
  /** 匹配模式（bash 工具的命令前缀） */
  pattern?: string
  /** 作用域 */
  scope: 'session' | 'global'
}

// ---------------------------------------------------------------------------
// Static regex constants
// ---------------------------------------------------------------------------

const RE_DANGEROUS_REDIRECT = /(?<![>|])>[^>]/
const RE_PIPE_OR_CHAIN = /\s*[|;&]\s*/
const RE_WHITESPACE = /\s+/

// ---------------------------------------------------------------------------
// 风险分级常量
// ---------------------------------------------------------------------------

/**
 * 危险命令前缀（红色警告，不允许添加进全局白名单）
 * 这些命令可能造成不可恢复的数据丢失或系统损坏
 */
export const DANGEROUS_COMMAND_PREFIXES: string[] = [
  'rm',
  'sudo',
  'chmod',
  'chown',
  'mkfs',
  'dd',
  'kill',
  'killall',
  'pkill',
  'git push --force',
  'git push -f',
  'git reset --hard',
  'git clean -fd',
  'format',
  'fdisk',
  'shutdown',
  'reboot',
  'systemctl',
]

/**
 * 中等风险命令前缀（黄色提示）
 */
export const MODERATE_COMMAND_PREFIXES: string[] = [
  'git push',
  'npm publish',
  'pnpm publish',
  'yarn publish',
  'docker rm',
  'docker stop',
  'docker kill',
  'mv',
  'cp',
]

/**
 * 多级命令前缀列表
 * 对于这些命令，智能前缀提取时会取前两个词
 * 例如 'git status --short' → 'git status'
 */
export const MULTI_WORD_COMMANDS: string[] = [
  'git',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'docker',
  'docker compose',
  'cargo',
  'go',
  'bun',
  'bunx',
  'pip',
  'python',
  'node',
]

/**
 * 工具级别的默认风险映射
 */
export const TOOL_DEFAULT_RISK: Record<string, RiskLevel> = {
  [BuiltinTool.ReadFile]: 'safe',
  [BuiltinTool.Glob]: 'safe',
  [BuiltinTool.Grep]: 'safe',
  [BuiltinTool.StrReplace]: 'moderate',
  [BuiltinTool.WriteFile]: 'moderate',
  [BuiltinTool.Bash]: 'moderate', // bash 需要进一步看 pattern
}

// ---------------------------------------------------------------------------
// 风险判断工具函数
// ---------------------------------------------------------------------------

/**
 * 判断命令是否匹配某个前缀列表中的某项
 * 使用精确前缀匹配：command === prefix 或 command.startsWith(prefix + ' ')
 */
function matchesAnyPrefix(command: string, prefixes: string[]): boolean {
  const trimmed = command.trim()
  // 按长度降序排列以优先匹配最长前缀
  const sorted = prefixes.toSorted((a, b) => b.length - a.length)
  return sorted.some(prefix =>
    trimmed === prefix || trimmed.startsWith(`${prefix} `),
  )
}

/**
 * 获取 bash 命令的风险等级
 */
export function getCommandRiskLevel(command: string): RiskLevel {
  const trimmed = command.trim()
  if (!trimmed)
    return 'safe'

  // 检查是否包含危险的重定向覆盖（> file, 不含 >>）
  // 简单检测：命令中出现 '>' 且前面不是 '>'
  if (RE_DANGEROUS_REDIRECT.test(trimmed)) {
    return 'moderate'
  }

  if (matchesAnyPrefix(trimmed, DANGEROUS_COMMAND_PREFIXES))
    return 'dangerous'

  if (matchesAnyPrefix(trimmed, MODERATE_COMMAND_PREFIXES))
    return 'moderate'

  return 'safe'
}

/**
 * 获取工具调用的风险等级
 * @param toolName 工具名称
 * @param pattern 匹配模式（仅 bash）
 */
export function getRiskLevel(toolName: string, pattern?: string): RiskLevel {
  if (toolName === BuiltinTool.Bash && pattern) {
    return getCommandRiskLevel(pattern)
  }
  return TOOL_DEFAULT_RISK[toolName] ?? 'moderate'
}

/**
 * 从 bash 命令中智能提取默认前缀
 * 规则：
 * - 管道/链式命令只取第一段
 * - 多级命令（git, npm 等）取前两个词
 * - 其余取第一个词
 */
export function extractDefaultPattern(toolName: string, args: Record<string, unknown>): string | undefined {
  if (toolName !== BuiltinTool.Bash)
    return undefined

  const command = String(args.command ?? '').trim()
  if (!command)
    return undefined

  // 去除管道和链式命令，只取第一段
  const firstSegment = command.split(RE_PIPE_OR_CHAIN)[0]?.trim() ?? command

  const words = firstSegment.split(RE_WHITESPACE)
  if (words.length === 0)
    return undefined

  const firstWord = words[0] ?? ''

  // 检查是否是多级命令
  // 先检查两级的（如 'docker compose'）
  if (words.length >= 2) {
    const twoWords = `${words[0]} ${words[1]}`
    if (MULTI_WORD_COMMANDS.includes(twoWords)) {
      // 三级命令，取前三个词
      return words.length >= 3 ? `${words[0]} ${words[1]} ${words[2]}` : twoWords
    }
  }

  // 再检查单级的多级命令
  if (MULTI_WORD_COMMANDS.includes(firstWord)) {
    return words.length >= 2 ? `${words[0]} ${words[1]}` : firstWord
  }

  return firstWord
}
