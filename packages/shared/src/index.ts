export type LanguageLevel = 'child' | 'teen' | 'adult'
export type AudienceProfile = 'patient' | 'business'

export interface AnswerProfile {
  languageLevel: LanguageLevel
  audience: AudienceProfile
}

export interface DocumentRecord {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: number
  chunkCount: number
}

export interface ChatSource {
  documentName: string
  excerpt: string
  score: number
}

export interface ChatRequest extends Partial<AnswerProfile> {
  question: string
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  profile?: AnswerProfile
}

export interface DocumentsResponse {
  documents: DocumentRecord[]
}

export interface ApiError {
  error: string
}
