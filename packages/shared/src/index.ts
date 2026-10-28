export type LanguageLevel = 'child' | 'teen' | 'adult'
export type AudienceProfile = 'patient' | 'business'
export type LlmProvider = 'template' | 'openai' | 'deepseek'

export interface AnswerProfile {
  languageLevel: LanguageLevel
  audience: AudienceProfile
}

export interface LlmAvailability {
  openai: boolean
  deepseek: boolean
}

export interface HealthResponse {
  ok: true
  llm: LlmAvailability
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
  llm?: LlmProvider
}

export interface ChatResponse {
  answer: string
  sources: ChatSource[]
  profile?: AnswerProfile
  llm?: LlmProvider
}

export interface DocumentsResponse {
  documents: DocumentRecord[]
}

export interface ApiError {
  error: string
}
