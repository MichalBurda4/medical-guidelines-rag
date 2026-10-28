import type { Chunk, ScoredChunk } from '../types.js'

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'as', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'with', 'from', 'that', 'this',
  'these', 'those', 'it', 'its', 'into', 'about', 'over', 'after', 'before', 'between',
  'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'can', 'could', 'should',
  'would', 'may', 'might', 'will', 'do', 'does', 'did', 'have', 'has', 'had', 'not', 'no',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźżäöüß\s-]/gi, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1)
  }
  for (const [token, count] of tf) {
    tf.set(token, count / tokens.length)
  }
  return tf
}

function buildIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>()
  for (const tokens of docs) {
    for (const token of new Set(tokens)) {
      df.set(token, (df.get(token) ?? 0) + 1)
    }
  }

  const idf = new Map<string, number>()
  const n = docs.length
  for (const [token, count] of df) {
    idf.set(token, Math.log((n + 1) / (count + 1)) + 1)
  }
  return idf
}

function vectorize(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vector = new Map<string, number>()
  for (const [token, value] of tf) {
    vector.set(token, value * (idf.get(token) ?? 0))
  }
  return vector
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0
  let normA = 0
  let normB = 0

  for (const value of a.values()) normA += value * value
  for (const value of b.values()) normB += value * value

  const [shorter, longer] = a.size <= b.size ? [a, b] : [b, a]
  for (const [token, value] of shorter) {
    const other = longer.get(token)
    if (other != null) dot += value * other
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function retrieveChunks(query: string, chunks: Chunk[], topK = 4): ScoredChunk[] {
  if (chunks.length === 0) return []

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  const docs = chunks.map((chunk) => tokenize(chunk.text))
  const idf = buildIdf([queryTokens, ...docs])
  const queryVector = vectorize(termFrequency(queryTokens), idf)

  const scored = chunks.map((chunk, index) => ({
    ...chunk,
    score: cosine(queryVector, vectorize(termFrequency(docs[index]), idf)),
  }))

  return scored
    .filter((chunk) => chunk.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
