export interface Chunk {
  id: string
  documentId: string
  documentName: string
  text: string
  index: number
}

export interface ScoredChunk extends Chunk {
  score: number
}
