import type { Message } from '../../db/schema.js'
import { generateText } from 'ai'
import { and, eq, gte } from 'drizzle-orm'
import { createLLMModel } from '../../agent/providers/model-factory.js'
import { db } from '../../db/index.js'
import { memoryMiningJobs, messages } from '../../db/schema.js'
import { getConversation } from '../../services/conversation.js'
import { getMessageCount, getMessages } from '../../services/message.js'
import { listTagsWithCount } from '../../services/tag.js'
import { createMemory } from '../core/crud.js'

import { parseMiningResults } from './miner-parser.js'

const REMEMBER_MARKERS = /记住|记得|别忘了|记下来|帮我记住/

const MINING_SYSTEM_PROMPT = `You are a memory extraction assistant.

Your task is to read a conversation between a user and an AI, and extract concrete, user-specific facts, preferences, decisions, or lessons that would be useful to remember in future conversations.

Rules:
- Only extract information about the USER (not the AI).
- Ignore greetings, small talk, generic explanations, and ephemeral tool output.
- Each memory must be 1-2 sentences, specific and factual.
- Reuse existing tags when possible. Use hierarchical tags with "/" separator (at least 2 levels).
- Valid tag prefixes include: preference/, fact/, lesson/, decision/, workflow/, project/.
- Output a JSON array. Each item has: { summary: string, tags: string[], confidence: number }.
- Confidence must be 0.0-1.0. Only include items with confidence >= 0.7 in your own judgment, but still return all extractions and let the caller filter.

Example output:
[
  {
    "summary": "User prefers Vue 3 Composition API with <script setup>.",
    "tags": ["preference/code-style/framework", "preference/code-style/vue"],
    "confidence": 0.95
  },
  {
    "summary": "User decided to use Pinia instead of Vuex for state management.",
    "tags": ["decision/project-architecture/state"],
    "confidence": 0.88
  }
]`

export async function shouldMineConversation(conversationId: string): Promise<boolean> {
  const messageCount = await getMessageCount(conversationId)
  if (messageCount < 5)
    return false

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [existing] = await db
    .select({ minedAt: memoryMiningJobs.minedAt })
    .from(memoryMiningJobs)
    .where(
      and(
        eq(memoryMiningJobs.conversationId, conversationId),
        gte(memoryMiningJobs.minedAt, since24h),
      ),
    )
    .limit(1)

  if (existing)
    return false

  const conversation = await getConversation(conversationId)
  if (!conversation)
    return false

  if (conversation.space === 'coding')
    return true

  // For chat space, require explicit remember-markers in user messages
  const userMessages = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, 'user'),
      ),
    )
    .all()

  return userMessages.some((msg) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    return REMEMBER_MARKERS.test(content)
  })
}

export async function mineConversation(conversationId: string): Promise<number> {
  const conversation = await getConversation(conversationId)
  if (!conversation)
    return 0

  const allMessages = await getMessages(conversationId)
  const exchanges = chunkExchangePairs(allMessages)
  if (exchanges.length === 0)
    return 0

  const tags = await listTagsWithCount()
  const tagLines = tags
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `  - ${t.name} (${t.noteCount})`)
    .join('\n')

  const workspacePath = conversation.projectKey || null

  let totalCreated = 0
  const model = createLLMModel({ thinkingMode: false })

  for (const exchange of exchanges) {
    if (exchange.length < 50)
      continue

    const userPrompt = `Existing tags (reuse when possible):\n${tagLines || '(none)'}\n\nConversation exchange:\n${exchange}\n\nExtract memories as JSON array.`

    try {
      const { text } = await generateText({
        model,
        system: MINING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        maxOutputTokens: 1500,
      })

      const results = parseMiningResults(text)
      for (const result of results) {
        if (result.confidence < 0.7 || !result.summary.trim())
          continue

        await createMemory({
          content: result.summary.trim(),
          tagNames: result.tags.length ? result.tags : ['auto/mined'],
          conversationId,
          workspacePath,
        })
        totalCreated++
      }
    }
    catch (err) {
      console.error('[memory-miner] Failed to mine exchange:', err)
    }
  }

  await db
    .insert(memoryMiningJobs)
    .values({
      conversationId,
      minedAt: new Date(),
      notesCreated: totalCreated,
    })
    .onConflictDoUpdate({
      target: memoryMiningJobs.conversationId,
      set: { minedAt: new Date(), notesCreated: totalCreated },
    })

  console.warn(`[memory-miner] Mined ${totalCreated} notes from conversation ${conversationId}`)
  return totalCreated
}

function chunkExchangePairs(allMessages: Message[]): string[] {
  // Filter to user + assistant only
  const relevant = allMessages.filter(m => m.role === 'user' || m.role === 'assistant')
  const pairs: string[] = []

  for (let i = 0; i < relevant.length - 1; i++) {
    const userMsg = relevant[i]
    const assistantMsg = relevant[i + 1]
    if (userMsg.role !== 'user' || assistantMsg.role !== 'assistant')
      continue

    const userText = extractText(userMsg)
    const assistantText = extractText(assistantMsg)

    // Skip pure code blocks or overly short content
    if (isPureCodeBlock(userText) && isPureCodeBlock(assistantText))
      continue

    const combined = `User: ${userText}\nAssistant: ${assistantText}`
    if (combined.length < 50)
      continue

    pairs.push(combined)
    i++ // skip assistantMsg in next iteration
  }

  return pairs
}

function extractText(msg: Message): string {
  return msg.content
}

function isPureCodeBlock(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 20)
    return false
  const lines = trimmed.split('\n')
  const codeFenceLines = lines.filter(l => l.trim().startsWith('```')).length
  if (codeFenceLines >= 2)
    return true
  return false
}
