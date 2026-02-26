/**
 * 提问工具的回答管理
 * 类似 approval.ts，用于暂停 agent loop 等待用户回答
 */

import type { QuestionAnswer } from './tools/ask_question.js'

export interface PendingQuestion {
  resolve: (answers: QuestionAnswer[]) => void
  toolCallId: string
  questions: Array<{ question: string, options: string[] }>
}

/**
 * 存储待回答的提问
 * key: toolCallId
 */
const pendingQuestions = new Map<string, PendingQuestion>()

/**
 * 请求用户回答问题
 * 返回一个 Promise，当用户提交回答时 resolve
 */
export function requestQuestionAnswer(
  toolCallId: string,
  questions: Array<{ question: string, options: string[] }>,
): Promise<QuestionAnswer[]> {
  return new Promise((resolve) => {
    pendingQuestions.set(toolCallId, {
      resolve,
      toolCallId,
      questions,
    })
  })
}

/**
 * 处理用户的回答
 * @returns boolean - 是否找到并处理了对应的待回答请求
 */
export function resolveQuestionAnswer(toolCallId: string, answers: QuestionAnswer[]): boolean {
  const pending = pendingQuestions.get(toolCallId)
  if (!pending) {
    return false
  }

  pending.resolve(answers)
  pendingQuestions.delete(toolCallId)
  return true
}

/**
 * 检查是否有待回答的提问
 */
export function hasPendingQuestion(toolCallId: string): boolean {
  return pendingQuestions.has(toolCallId)
}

/**
 * 获取指定 toolCallId 的待回答提问（不删除）
 */
export function getPendingQuestion(toolCallId: string): PendingQuestion | undefined {
  return pendingQuestions.get(toolCallId)
}

/**
 * 清除指定 toolCallId 的待回答请求
 */
export function clearPendingQuestion(toolCallId: string): void {
  const pending = pendingQuestions.get(toolCallId)
  if (pending) {
    pending.resolve([]) // 默认返回空回答
    pendingQuestions.delete(toolCallId)
  }
}

/**
 * 清除所有待回答请求
 */
export function clearAllPendingQuestions(): void {
  for (const pending of pendingQuestions.values()) {
    pending.resolve([])
  }
  pendingQuestions.clear()
}
