export interface DocumentRecord {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: number
  chunkCount: number
}

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

export interface ChatSource {
  documentName: string
  excerpt: string
  score: number
}

export type LanguageLevel = 'child' | 'teen' | 'adult'
export type AudienceProfile = 'patient' | 'business'

export interface AnswerProfile {
  languageLevel: LanguageLevel
  audience: AudienceProfile
}
