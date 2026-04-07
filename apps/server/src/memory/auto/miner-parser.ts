interface MiningResult {
  summary: string
  tags: string[]
  confidence: number
}

const JSON_CODE_BLOCK_RE = /```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/

export function parseMiningResults(text: string): MiningResult[] {
  try {
    const codeBlockMatch = JSON_CODE_BLOCK_RE.exec(text)
    const jsonText = codeBlockMatch ? codeBlockMatch[1]!.trim() : text.trim()
    const parsed = JSON.parse(jsonText)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is MiningResult =>
          typeof item.summary === 'string'
          && Array.isArray(item.tags)
          && typeof item.confidence === 'number',
      )
    }
    return []
  }
  catch {
    return []
  }
}
