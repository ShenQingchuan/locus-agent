import type { SSEEvent } from '../types/sse-events.js'

/**
 * Parse a single SSE text line into a typed event object.
 * Returns null for empty lines, comments, or [DONE] sentinel.
 */
export function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data: '))
    return null

  const data = line.slice(6)
  if (data === '[DONE]')
    return null

  try {
    return JSON.parse(data) as SSEEvent
  }
  catch {
    return null
  }
}

/**
 * Serialize a typed SSE event into the `data: {...}` wire format.
 */
export function serializeSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}`
}

/**
 * Produce the Hono-compatible `{ event, data }` object for streamSSE.
 */
export function createSSEEventPayload(event: SSEEvent): { event: string, data: string } {
  return {
    event: 'message',
    data: JSON.stringify(event),
  }
}
