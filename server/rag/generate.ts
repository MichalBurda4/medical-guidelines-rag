import type { AnswerProfile, ChatSource, ScoredChunk } from '../types.js'
import { buildLlmSystemPrompt, formatProfiledAnswer } from './profile.js'

function excerpt(text: string, max = 220): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1)}…`
}

function pickResultSentences(text: string): string[] {
  const bulletParts = text
    .split(/\n+|•|\u2022|(?:^|\s)-\s+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const sentenceParts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

  const candidates = [...bulletParts, ...sentenceParts]
    .map((part) => part.replace(/^[-–—]\s*/, '').trim())
    .filter((part) => part.length > 35)

  const resultHints =
    /side effect|adverse|risk|safe|safety|pregnan|adherence|complian|efficac|symptom|improv|onset|duration|dose|recommend|contra.?indic|age|child|adult|patient|outcome|result|finding|benefit|harm|warning|irritation|drowsiness|sedation|congestion/i

  const preferred = candidates.filter((part) => resultHints.test(part))
  const pool = preferred.length > 0 ? preferred : candidates
  return [...new Set(pool)].slice(0, 3)
}

export function buildSources(chunks: ScoredChunk[]): ChatSource[] {
  return chunks.map((chunk) => ({
    documentName: chunk.documentName,
    excerpt: excerpt(chunk.text),
    score: chunk.score,
  }))
}

function collectFindings(chunks: ScoredChunk[]): string[] {
  const findings: string[] = []
  for (const chunk of chunks) {
    for (const sentence of pickResultSentences(chunk.text)) {
      if (!findings.includes(sentence)) findings.push(sentence)
      if (findings.length >= 5) return findings
    }
  }
  return findings
}

export function generateAnswer(
  question: string,
  chunks: ScoredChunk[],
  profile: AnswerProfile,
): string {
  if (chunks.length === 0) {
    return [
      'I could not find relevant context in the uploaded documents for that question.',
      'Try rephrasing, or upload guidelines that cover this topic.',
    ].join(' ')
  }

  const findings = collectFindings(chunks)
  const docNames = [...new Set(chunks.map((chunk) => chunk.documentName))]

  if (findings.length === 0) {
    const fallback = chunks.map((chunk) => excerpt(chunk.text, 280))
    return formatProfiledAnswer(question, fallback, docNames, profile)
  }

  return formatProfiledAnswer(question, findings, docNames, profile)
}

export async function generateAnswerWithOptionalLlm(
  question: string,
  chunks: ScoredChunk[],
  profile: AnswerProfile,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || chunks.length === 0) {
    return generateAnswer(question, chunks, profile)
  }

  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] Source: ${chunk.documentName}\n${chunk.text}`,
    )
    .join('\n\n')

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: buildLlmSystemPrompt(profile),
          },
          {
            role: 'user',
            content: `Context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      return generateAnswer(question, chunks, profile)
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    return content || generateAnswer(question, chunks, profile)
  } catch {
    return generateAnswer(question, chunks, profile)
  }
}
