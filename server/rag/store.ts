import { randomUUID } from 'node:crypto'
import type { Chunk, DocumentRecord } from '../types.js'
import { chunkText } from './chunk.js'
import { extractText } from './parse.js'

const documents = new Map<string, DocumentRecord>()
const chunks: Chunk[] = []

export function listDocuments(): DocumentRecord[] {
  return [...documents.values()].sort((a, b) => b.uploadedAt - a.uploadedAt)
}

export function getChunks(): Chunk[] {
  return chunks
}

export async function addDocument(
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<DocumentRecord> {
  const text = await extractText(filename, buffer)
  if (!text.trim()) {
    throw new Error(`No extractable text found in “${filename}”.`)
  }

  const id = randomUUID()
  const docChunks = chunkText(text, id, filename)
  if (docChunks.length === 0) {
    throw new Error(`Could not create chunks for “${filename}”.`)
  }

  const record: DocumentRecord = {
    id,
    name: filename,
    size: buffer.length,
    type: mimeType || 'application/octet-stream',
    uploadedAt: Date.now(),
    chunkCount: docChunks.length,
  }

  documents.set(id, record)
  chunks.push(...docChunks)
  return record
}

export function removeDocument(id: string): boolean {
  if (!documents.has(id)) return false
  documents.delete(id)

  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    if (chunks[i].documentId === id) chunks.splice(i, 1)
  }
  return true
}
