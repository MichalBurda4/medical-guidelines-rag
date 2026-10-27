export type MessageRole = 'user' | 'assistant'

export type LanguageLevel = 'child' | 'teen' | 'adult'
export type AudienceProfile = 'patient' | 'business'

export interface SourceSnippet {
  documentName: string
  excerpt: string
  score: number
}

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  createdAt: number
  sources?: SourceSnippet[]
}

export interface UploadedDocument {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: number
  chunkCount?: number
}

export interface AnswerProfile {
  languageLevel: LanguageLevel
  audience: AudienceProfile
}
