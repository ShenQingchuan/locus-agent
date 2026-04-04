import type { DelegateDelta, ToolCall, ToolResult } from '@univedge/locus-agent-sdk'
import type { ConversationRuntimeState, ToolCallState } from '../types'
import { parseManageTodosResult } from '@/utils/parsers'

export function createToolCallMutators(
  getConversationRuntimeState: (conversationId?: string | null) => ConversationRuntimeState,
) {
  function addToolCallToMessage(
    id: string,
    toolCall: ToolCall,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const index = runtimeState.messages.findIndex(m => m.id === id)
    const message = index !== -1 ? runtimeState.messages[index] : undefined
    if (!message)
      return

    const toolCalls = [...(message.toolCalls || [])]
    const existingIndex = toolCalls.findIndex(
      tc => tc.toolCall.toolCallId === toolCall.toolCallId,
    )
    if (existingIndex >= 0) {
      const existing = toolCalls[existingIndex]
      if (!existing)
        return
      toolCalls[existingIndex] = { ...existing, toolCall }
      runtimeState.messages[index] = {
        ...message,
        toolCalls,
      }
      return
    }

    const toolCallIndex = toolCalls.length
    toolCalls.push({ toolCall, status: 'pending' })

    const parts = [...(message.parts || [])]
    parts.push({ type: 'tool-call', toolCallIndex })

    runtimeState.messages[index] = {
      ...message,
      toolCalls,
      parts,
    }
  }

  function updateToolCallResult(
    messageId: string,
    toolResult: ToolResult,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolResult.toolCallId) {
          return toolCallState
        }
        hasMatch = true
        let status: ToolCallState['status'] = 'completed'
        if (toolResult.isInterrupted) {
          status = 'interrupted'
        }
        else if (toolResult.isError) {
          status = 'error'
        }
        return {
          ...toolCallState,
          result: toolResult,
          status,
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }

      const matchedToolCall = message.toolCalls.find(tc => tc.toolCall.toolCallId === toolResult.toolCallId)?.toolCall
      if (matchedToolCall && matchedToolCall.toolName === 'manage_todos' && !toolResult.isError) {
        const parsed = parseManageTodosResult(toolResult.result)
        if (parsed)
          runtimeState.todoTasks = parsed
      }
    }
    runtimeState.pendingApprovals.delete(toolResult.toolCallId)
  }

  function appendToolCallOutput(
    toolCallId: string,
    delta: string,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      const tcIndex = message.toolCalls.findIndex(
        tc => tc.toolCall.toolCallId === toolCallId,
      )
      if (tcIndex === -1)
        continue

      const tc = message.toolCalls[tcIndex]!
      const newToolCalls = [...message.toolCalls]
      newToolCalls[tcIndex] = {
        ...tc,
        output: (tc.output || '') + delta,
      }
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function appendDelegateDelta(
    toolCallId: string,
    delta: DelegateDelta,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = runtimeState.messages.length - 1; i >= 0; i--) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      const tcIndex = message.toolCalls.findIndex(
        tc => tc.toolCall.toolCallId === toolCallId,
      )
      if (tcIndex === -1)
        continue

      const tc = message.toolCalls[tcIndex]!
      const newToolCalls = [...message.toolCalls]
      newToolCalls[tcIndex] = {
        ...tc,
        delegateDeltas: [...(tc.delegateDeltas || []), delta],
      }
      runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
      return
    }
  }

  function setToolCallAwaitingApproval(
    messageId: string,
    toolCallId: string,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-approval',
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallAwaitingQuestion(
    messageId: string,
    toolCallId: string,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    const messageIndex = runtimeState.messages.findIndex(m => m.id === messageId)
    const message = messageIndex !== -1 ? runtimeState.messages[messageIndex] : undefined
    if (message?.toolCalls) {
      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        return {
          ...toolCallState,
          status: 'awaiting-question',
        }
      })
      if (hasMatch) {
        runtimeState.messages[messageIndex] = { ...message, toolCalls: newToolCalls }
      }
    }
  }

  function setToolCallExecuting(
    toolCallId: string,
    conversationId: string | null | undefined,
  ) {
    const runtimeState = getConversationRuntimeState(conversationId)
    for (let i = 0; i < runtimeState.messages.length; i++) {
      const message = runtimeState.messages[i]
      if (!message?.toolCalls || message.toolCalls.length === 0)
        continue

      let hasMatch = false
      const newToolCalls = message.toolCalls.map((toolCallState): ToolCallState => {
        if (toolCallState.toolCall.toolCallId !== toolCallId) {
          return toolCallState
        }
        hasMatch = true
        if (toolCallState.status !== 'awaiting-approval' && toolCallState.status !== 'awaiting-question') {
          return toolCallState
        }
        return { ...toolCallState, status: 'pending' }
      })

      if (hasMatch) {
        runtimeState.messages[i] = { ...message, toolCalls: newToolCalls }
        return
      }
    }
  }

  return {
    addToolCallToMessage,
    updateToolCallResult,
    appendToolCallOutput,
    appendDelegateDelta,
    setToolCallAwaitingApproval,
    setToolCallAwaitingQuestion,
    setToolCallExecuting,
  }
}
