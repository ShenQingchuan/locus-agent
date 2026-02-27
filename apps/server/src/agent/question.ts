import type { QuestionAnswer } from './tools/ask_question.js'
import { createPendingRequestStore } from './pending-request-store.js'

export interface PendingQuestion {
  resolve: (answers: QuestionAnswer[]) => void
  toolCallId: string
  questions: Array<{ question: string, options: string[] }>
}

const questionStore = createPendingRequestStore<
  { questions: Array<{ question: string, options: string[] }> },
  QuestionAnswer[]
>({
  defaultResolveValue: [],
})

function toPendingQuestion(
  entry: ReturnType<typeof questionStore.getAll>[number],
): PendingQuestion {
  return {
    resolve: entry.resolve,
    toolCallId: entry.requestId,
    questions: entry.payload.questions,
  }
}

export function requestQuestionAnswer(
  toolCallId: string,
  questions: Array<{ question: string, options: string[] }>,
): Promise<QuestionAnswer[]> {
  return questionStore.request(toolCallId, { questions })
}

export function resolveQuestionAnswer(toolCallId: string, answers: QuestionAnswer[]): boolean {
  return questionStore.resolve(toolCallId, answers)
}

export function hasPendingQuestion(toolCallId: string): boolean {
  return questionStore.has(toolCallId)
}

export function getPendingQuestion(toolCallId: string): PendingQuestion | undefined {
  const pending = questionStore.get(toolCallId)
  return pending ? toPendingQuestion(pending) : undefined
}

export function clearPendingQuestion(toolCallId: string): void {
  questionStore.clear(toolCallId)
}

export function clearAllPendingQuestions(): void {
  questionStore.clearAll()
}
