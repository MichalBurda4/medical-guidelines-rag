import type { AnswerProfile, ChatSource, LlmProvider } from '@medirag/shared'
import type { ScoredChunk } from '../types.js'
import { completeChat, resolveLlmProvider } from './llm.js'
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
  requestedLlm?: LlmProvider,
): Promise<{ answer: string; llm: LlmProvider }> {
  const llm = resolveLlmProvider(requestedLlm)
  if (llm === 'template' || chunks.length === 0) {
    return { answer: generateAnswer(question, chunks, profile), llm: 'template' }
  }

  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] Source: ${chunk.documentName}\n${chunk.text}`,
    )
    .join('\n\n')

  const content = await completeChat(
    llm,
    buildLlmSystemPrompt(profile),
    `Context:\n${context}\n\nQuestion: ${question}`,
  )

  if (!content) {
    return { answer: generateAnswer(question, chunks, profile), llm: 'template' }
  }

  return { answer: content, llm }
}
