import { tool } from 'ai'
import { z } from 'zod'

/**
 * 提问工具定义
 * 用于向用户提出问题并获取回答
 */
export const askQuestionTool = tool({
  description: 'Ask the user one or more questions. Each question has up to 4 predefined options (the UI will also show a free-form custom input, so you do NOT need to include a catch-all option). Set multiple to true to allow selecting more than one option. Use this tool when you need clarification or decisions from the user before proceeding.',
  inputSchema: z.object({
    questions: z.array(z.object({
      question: z.string().describe('A clear, specific question to ask the user'),
      options: z.array(z.string()).max(4).describe('Up to 4 predefined answer options (declarative statements that directly answer the question). Do NOT add catch-all options like "Other" — a custom input field is always available.'),
      multiple: z.boolean().optional().describe('Whether the user can select multiple options (default: false, single select)'),
    })).describe('Array of questions to ask the user'),
  }),
})

/**
 * 提问工具的问题结构
 */
export interface QuestionItem {
  question: string
  options: string[]
  multiple?: boolean
}

/**
 * 提问工具的回答结构
 */
export interface QuestionAnswer {
  question: string
  answer: string
}

/**
 * 格式化回答为消息文本
 */
export function formatQuestionAnswers(answers: QuestionAnswer[]): string {
  return answers
    .map(a => `- ${a.question}：\n${a.answer}`)
    .join('\n\n')
}
