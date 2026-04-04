import type { RiskLevel } from '@univedge/locus-agent-sdk'
import type { QuestionAnswer } from '@/api/chat'
import type { ToolCallState } from '@/composables/assistant-runtime'

export interface UseToolCallItemProps {
  tool: ToolCallState
  suggestedPattern?: string
  riskLevel?: RiskLevel
  questionData?: {
    questions: Array<{ question: string, options: string[], multiple?: boolean }>
  }
  compact?: boolean
}

export interface ToolCallItemEmits {
  approve: [toolCallId: string]
  reject: [toolCallId: string]
  whitelist: [toolCallId: string, payload: { pattern?: string, scope: 'session' | 'global' }]
  questionAnswer: [toolCallId: string, answers: QuestionAnswer[]]
  delegateResume: [payload: { taskId: string, agentType: string, agentName: string }]
}
