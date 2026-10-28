import type { Chunk } from '../types.js'

const DEFAULT_CHUNK_SIZE = 900
const DEFAULT_OVERLAP = 150

export function chunkText(
  text: string,
  documentId: string,
  documentName: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
): Chunk[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+\n/g, '\n').trim()
  if (!normalized) return []

  const chunks: Chunk[] = []
  let start = 0
  let index = 0

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length)

    if (end < normalized.length) {
      const slice = normalized.slice(start, end)
      const breakAt = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'))
      if (breakAt > chunkSize * 0.4) {
        end = start + breakAt + 1
      }
    }

    const piece = normalized.slice(start, end).trim()
    if (piece) {
      chunks.push({
        id: `${documentId}-${index}`,
        documentId,
        documentName,
        text: piece,
        index,
      })
      index += 1
    }

    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }

  return chunks
}
